/* ============================================================
   MSY PORTAL — /api/whatsapp (Vercel Serverless Function)
   Ponte entre o portal e a API do bot Corvus (WhatsApp).

   O token do Corvus fica SÓ aqui no servidor (env CORVUS_API_TOKEN),
   nunca no navegador. Quem chama precisa estar logado no portal e estar
   em bot_settings.allowed_senders (editável na Central do Bot, bot.html).

   GET               → { conectado, grupos: [{ id, nome, participantes, ativo, boasVindas, antilink, botAdmin }], comWhatsapp: [user_id] }
   GET ?r=saude      → saúde do bot (conexão, reconexões, falhas recentes)
   GET ?r=membros    → números que estão no grupo do privado (Masayoshi)
   GET ?r=ranking&grupo=ID → top de XP e de mensagens do grupo
   PATCH { grupo, ativo?, boasVindas?, antilink? } → liga/desliga no grupo
   POST  { grupo, mensagem, nome?, app? }  envia num grupo do WhatsApp
         { membro, mensagem, nome?, app? } envia no privado do membro (user_id)
   Todo envio fica registrado em bot_messages (via = portal | agente, app).
   Envio vindo do Agente MSY (sessão registrada em agent_sessions) sai direto,
   sem clique e sem cota, mas respeita bot_send_policy (grupos permitidos e
   privado). Sem linha na tabela valem os padrões.
   PATCH pelo agente só para quem tem controla_corvus na política.

   Env na Vercel:
     CORVUS_API_TOKEN  (obrigatório) token da API do Corvus
     CORVUS_API_URL       (opcional) padrão http://163.176.188.246:3000; troque pelo túnel HTTPS
     CORVUS_REQUIRE_HTTPS (depois do túnel) "1" recusa qualquer endereço que não seja https://
   ============================================================ */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://lldzgkxpoyqauxdcjyaw.supabase.co';
// Chave pública (anon) — a mesma de js/config.js; o RLS protege os dados.
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsZHpna3hwb3lxYXV4ZGNqeWF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1OTg4OTgsImV4cCI6MjA4OTE3NDg5OH0.HlYCSLVnDF2FlASgUCSyfd3ZMi1VJXCxHszOhwBy9KQ';
const CORVUS_API_URL = (process.env.CORVUS_API_URL || 'http://163.176.188.246:3000').replace(/\/$/, '');
// O token do Corvus vai no cabeçalho: por HTTP simples ele viaja aberto entre a Vercel e a VPS.
// Transição: http continua funcionando até existir o túnel; aí liga CORVUS_REQUIRE_HTTPS=1.
const CORVUS_URL_OK = /^https:\/\//.test(CORVUS_API_URL) || (process.env.CORVUS_REQUIRE_HTTPS !== '1' && /^http:\/\//.test(CORVUS_API_URL));

// Padrões quando a pessoa não tem linha em bot_send_policy (valem só para envio vindo do agente).
const POLICY_DEFAULT = { pode_privado: true, grupos: null, controla_corvus: false };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function supabase(path, userToken, options = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${userToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!res.ok) throw Object.assign(new Error(`Supabase ${res.status}`), { status: res.status });
  return res.status === 204 || res.headers.get('content-length') === '0' ? null : res.json();
}

async function corvus(path, options = {}) {
  const res = await fetch(`${CORVUS_API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.CORVUS_API_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(15000)
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

/** Confere o login e se o usuário está liberado no bot; retorna { token, userId }. */
async function authorize(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw Object.assign(new Error('Faça login no portal.'), { status: 401 });

  let user;
  try {
    user = await supabase('/auth/v1/user', token);
  } catch {
    throw Object.assign(new Error('Sessão expirada. Faça login de novo.'), { status: 401 });
  }

  // RLS: só a diretoria lê bot_settings; para os demais a lista vem vazia.
  const settings = await supabase('/rest/v1/bot_settings?id=eq.1&select=allowed_senders', token);
  if (!(settings[0]?.allowed_senders || []).includes(user.id)) {
    throw Object.assign(new Error('Você não tem acesso ao bot.'), { status: 403 });
  }
  // Sessão criada para o Agente MSY? (agent_sessions, gravada no login do agente)
  let isAgent = false;
  try {
    isAgent = (await supabase('/rest/v1/rpc/is_agent_session', token, { method: 'POST', body: '{}' })) === true;
  } catch (err) {
    // Sem a função (migration não aplicada) ninguém é tratado como agente.
    console.error('[MSY][whatsapp] is_agent_session:', err.message);
  }
  return { token, userId: user.id, isAgent };
}

async function policyOf(token, userId) {
  try {
    const rows = await supabase(`/rest/v1/bot_send_policy?user_id=eq.${userId}&select=*`, token);
    return { ...POLICY_DEFAULT, ...(rows[0] || {}) };
  } catch {
    return { ...POLICY_DEFAULT };
  }
}

/** Confere a política para um envio vindo do agente; devolve o motivo da recusa ou null. Sem cota e sem horário. */
async function policyBlock(token, userId, { target_type, target }) {
  const p = await policyOf(token, userId);
  if (target_type === 'membro' && !p.pode_privado) return 'Você não está liberado para mandar no privado pelo agente.';
  if (target_type === 'grupo' && Array.isArray(p.grupos) && !p.grupos.includes(target)) return 'Esse grupo não está liberado para você pelo agente.';
  return null;
}

/** Resolve o destino (grupo ou membro) e confere se o membro pode receber. */
async function resolveTarget(token, body) {
  const GROUP_RE = /^[0-9-]+@g\.us$/;
  if (body.grupo) {
    if (!GROUP_RE.test(String(body.grupo))) throw Object.assign(new Error('Grupo inválido.'), { status: 400 });
    return { target_type: 'grupo', target: String(body.grupo), payload: { grupo: String(body.grupo) } };
  }
  if (UUID_RE.test(String(body.membro || ''))) {
    const rows = await supabase(`/rest/v1/member_whatsapp?user_id=eq.${body.membro}&select=whatsapp,receive`, token);
    if (!rows[0]) throw Object.assign(new Error('Esse membro não tem WhatsApp cadastrado.'), { status: 404 });
    if (!rows[0].receive) throw Object.assign(new Error('Esse membro está desativado na Central do Bot.'), { status: 403 });
    return { target_type: 'membro', target: String(body.membro), payload: { numero: rows[0].whatsapp } };
  }
  throw Object.assign(new Error('Escolha um grupo ou um membro.'), { status: 400 });
}

/** Grava o envio no histórico; uma falha aqui não desfaz o envio. */
async function logMessage(token, row) {
  try {
    await supabase('/rest/v1/bot_messages', token, {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(row)
    });
  } catch (err) {
    console.error('[MSY][whatsapp] Falha ao gravar histórico:', err.message);
  }
}

module.exports = async (req, res) => {
  try {
    if (!process.env.CORVUS_API_TOKEN) {
      return res.status(500).json({ erro: 'CORVUS_API_TOKEN não configurado na Vercel.' });
    }
    if (!CORVUS_URL_OK) {
      return res.status(500).json({ erro: 'CORVUS_API_URL precisa ser https:// (CORVUS_REQUIRE_HTTPS está ligado).' });
    }
    const { token, userId, isAgent } = await authorize(req);

    const GROUP_RE = /^[0-9-]+@g\.us$/;

    if (req.method === 'GET' && req.query?.r) {
      let path;
      if (req.query.r === 'saude') path = '/status';
      else if (req.query.r === 'membros') path = '/membros';
      else if (req.query.r === 'ranking' && GROUP_RE.test(String(req.query.grupo || ''))) {
        path = `/grupos/${encodeURIComponent(req.query.grupo)}/ranking`;
      } else return res.status(400).json({ erro: 'Consulta inválida.' });
      const out = await corvus(path);
      return res.status(out.status).json(out.data);
    }

    if (req.method === 'PATCH') {
      if (isAgent && !(await policyOf(token, userId)).controla_corvus) {
        return res.status(403).json({ erro: 'Ligar ou desligar o Corvus num grupo pelo agente é só para quem a diretoria liberou (controla_corvus).' });
      }
      const body = req.body || {};
      if (!GROUP_RE.test(String(body.grupo || ''))) return res.status(400).json({ erro: 'Grupo inválido.' });
      const patch = {};
      for (const k of ['ativo', 'boasVindas', 'antilink']) if (typeof body[k] === 'boolean') patch[k] = body[k];
      const out = await corvus(`/grupos/${encodeURIComponent(body.grupo)}`, { method: 'PATCH', body: JSON.stringify(patch) });
      return res.status(out.status).json(out.data);
    }

    if (req.method === 'GET') {
      const [status, grupos, contatos] = await Promise.all([
        corvus('/status'),
        corvus('/grupos'),
        supabase('/rest/v1/member_whatsapp?receive=eq.true&select=user_id', token)
      ]);
      return res.status(200).json({
        conectado: Boolean(status.data.conectado),
        grupos: grupos.status === 200
          ? grupos.data.grupos
          : [],
        comWhatsapp: contatos.map(c => c.user_id)
      });
    }

    if (req.method === 'POST') {
      const body = req.body || {};

      // ── Envio: pela Central do Bot (pessoa) ou pelo Agente MSY (direto, dentro da política) ──
      const mensagem = String(body.mensagem || '').trim();
      if (!mensagem) return res.status(400).json({ erro: 'Escreva a mensagem.' });
      if (mensagem.length > 4000) return res.status(400).json({ erro: 'Mensagem acima de 4000 caracteres.' });
      const dest = await resolveTarget(token, body);
      if (isAgent) {
        const motivo = await policyBlock(token, userId, dest);
        if (motivo) return res.status(403).json({ erro: motivo });
      }

      const sent = await corvus('/enviar', { method: 'POST', body: JSON.stringify({ ...dest.payload, mensagem }) });
      await logMessage(token, {
        target_type: dest.target_type,
        target: dest.target,
        sent_by: userId,
        target_name: body.nome ? String(body.nome).slice(0, 120) : null,
        message: mensagem,
        ok: sent.status === 200,
        error: sent.status === 200 ? null : (sent.data.erro || `HTTP ${sent.status}`),
        via: isAgent ? 'agente' : 'portal',
        app: isAgent && body.app ? String(body.app).slice(0, 60) : null
      });
      return res.status(sent.status).json(sent.data);
    }

    res.setHeader('Allow', 'GET, POST, PATCH');
    return res.status(405).json({ erro: 'Método não permitido.' });
  } catch (err) {
    if (!err.status) console.error('[MSY][whatsapp]', err);
    return res.status(err.status || 500).json({
      erro: err.status ? err.message : 'Falha ao falar com o bot. Tente de novo.'
    });
  }
};
