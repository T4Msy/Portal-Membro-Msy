/* ============================================================
   MSY PORTAL — /api/whatsapp (Vercel Serverless Function)
   Ponte entre o portal e a API do bot Corvus (WhatsApp).

   O token do Corvus fica SÓ aqui no servidor (env CORVUS_API_TOKEN),
   nunca no navegador. Quem chama precisa estar logado no portal e estar
   em bot_settings.allowed_senders (editável na Central do Bot, bot.html).

   GET  → { conectado, grupos: [{ id, nome, participantes }], comWhatsapp: [user_id] }
   POST → { grupo, mensagem }  envia num grupo do WhatsApp
          { membro, mensagem } envia no privado do membro (user_id)
   Todo envio fica registrado em bot_messages.

   Env na Vercel:
     CORVUS_API_TOKEN  (obrigatório) token da API do Corvus
     CORVUS_API_URL    (opcional)    padrão http://163.176.188.246:3000
   ============================================================ */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://lldzgkxpoyqauxdcjyaw.supabase.co';
// Chave pública (anon) — a mesma de js/config.js; o RLS protege os dados.
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsZHpna3hwb3lxYXV4ZGNqeWF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1OTg4OTgsImV4cCI6MjA4OTE3NDg5OH0.HlYCSLVnDF2FlASgUCSyfd3ZMi1VJXCxHszOhwBy9KQ';
const CORVUS_API_URL = (process.env.CORVUS_API_URL || 'http://163.176.188.246:3000').replace(/\/$/, '');
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
  return { token, userId: user.id };
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
    const { token, userId } = await authorize(req);

    if (req.method === 'GET') {
      const [status, grupos, contatos] = await Promise.all([
        corvus('/status'),
        corvus('/grupos'),
        supabase('/rest/v1/member_whatsapp?receive=eq.true&select=user_id', token)
      ]);
      return res.status(200).json({
        conectado: Boolean(status.data.conectado),
        grupos: grupos.status === 200
          ? grupos.data.grupos.map(g => ({ id: g.id, nome: g.nome, participantes: g.participantes }))
          : [],
        comWhatsapp: contatos.map(c => c.user_id)
      });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const mensagem = String(body.mensagem || '').trim();
      if (!mensagem) return res.status(400).json({ erro: 'Escreva a mensagem.' });

      let payload;
      let log;
      if (body.grupo) {
        payload = { grupo: String(body.grupo), mensagem };
        log = { target_type: 'grupo', target: payload.grupo };
      } else if (UUID_RE.test(String(body.membro || ''))) {
        const rows = await supabase(`/rest/v1/member_whatsapp?user_id=eq.${body.membro}&select=whatsapp,receive`, token);
        if (!rows[0]) return res.status(404).json({ erro: 'Esse membro não tem WhatsApp cadastrado.' });
        if (!rows[0].receive) return res.status(403).json({ erro: 'Esse membro está desativado na Central do Bot.' });
        payload = { numero: rows[0].whatsapp, mensagem };
        log = { target_type: 'membro', target: body.membro };
      } else {
        return res.status(400).json({ erro: 'Escolha um grupo ou um membro.' });
      }

      const sent = await corvus('/enviar', { method: 'POST', body: JSON.stringify(payload) });
      await logMessage(token, {
        ...log,
        sent_by: userId,
        target_name: body.nome ? String(body.nome).slice(0, 120) : null,
        message: mensagem,
        ok: sent.status === 200,
        error: sent.status === 200 ? null : (sent.data.erro || `HTTP ${sent.status}`)
      });
      return res.status(sent.status).json(sent.data);
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ erro: 'Método não permitido.' });
  } catch (err) {
    if (!err.status) console.error('[MSY][whatsapp]', err);
    return res.status(err.status || 500).json({
      erro: err.status ? err.message : 'Falha ao falar com o bot. Tente de novo.'
    });
  }
};
