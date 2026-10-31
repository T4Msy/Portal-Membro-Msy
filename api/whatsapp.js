/* ============================================================
   MSY PORTAL — /api/whatsapp (Vercel Serverless Function)
   Ponte entre o portal e a API do bot Corvus (WhatsApp).

   O token do Corvus fica SÓ aqui no servidor (env CORVUS_API_TOKEN),
   nunca no navegador. Quem chama precisa estar logado no portal e ser
   diretoria ou ter permissão de gerenciar atividades.

   GET  → { grupos: [{ id, nome }], comWhatsapp: [user_id, ...] }
   POST → { grupo, mensagem }  envia num grupo do WhatsApp
          { membro, mensagem } envia no privado do membro (user_id)

   Env na Vercel:
     CORVUS_API_TOKEN  (obrigatório) token da API do Corvus
     CORVUS_API_URL    (opcional)    padrão http://163.176.188.246:3000
   ============================================================ */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://lldzgkxpoyqauxdcjyaw.supabase.co';
// Chave pública (anon) — a mesma de js/config.js; o RLS protege os dados.
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsZHpna3hwb3lxYXV4ZGNqeWF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1OTg4OTgsImV4cCI6MjA4OTE3NDg5OH0.HlYCSLVnDF2FlASgUCSyfd3ZMi1VJXCxHszOhwBy9KQ';
const CORVUS_API_URL = (process.env.CORVUS_API_URL || 'http://163.176.188.246:3000').replace(/\/$/, '');
const MANAGE_PERMS = ['gerenciar_atividades', 'criar_atividades', 'editar_atividades'];
// Fase de testes: só estes usuários podem usar (mesma lista de WhatsAppManager em js/push.js).
const ALLOWED_USERS = [
  'd15bace3-ea81-4d56-ac21-0af611e6cf1e', // Xitter
  'bcba3663-c3f9-4e2f-a134-1e2b240f11f6', // Tales Masayoshi
];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function supabase(path, userToken) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${userToken}` }
  });
  if (!res.ok) throw Object.assign(new Error(`Supabase ${res.status}`), { status: res.status });
  return res.json();
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

/** Confere o login e a permissão de quem chamou; retorna o id do usuário. */
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
  if (!ALLOWED_USERS.includes(user.id)) {
    throw Object.assign(new Error('Notificação por WhatsApp ainda em testes.'), { status: 403 });
  }

  const [profiles, perms] = await Promise.all([
    supabase(`/rest/v1/profiles?id=eq.${user.id}&select=tier`, token),
    supabase(`/rest/v1/member_permissions?user_id=eq.${user.id}&select=permissions`, token)
  ]);
  const isDiretoria = profiles[0]?.tier === 'diretoria';
  const granted = perms[0]?.permissions || [];
  if (!isDiretoria && !MANAGE_PERMS.some(p => granted.includes(p))) {
    throw Object.assign(new Error('Sem permissão para enviar notificações.'), { status: 403 });
  }
  return token;
}

module.exports = async (req, res) => {
  try {
    if (!process.env.CORVUS_API_TOKEN) {
      return res.status(500).json({ erro: 'CORVUS_API_TOKEN não configurado na Vercel.' });
    }
    const token = await authorize(req);

    if (req.method === 'GET') {
      const [grupos, contatos] = await Promise.all([
        corvus('/grupos'),
        supabase('/rest/v1/member_whatsapp?select=user_id', token)
      ]);
      if (grupos.status !== 200) return res.status(502).json({ erro: grupos.data.erro || 'Bot indisponível.' });
      return res.status(200).json({
        grupos: grupos.data.grupos.map(g => ({ id: g.id, nome: g.nome })),
        comWhatsapp: contatos.map(c => c.user_id)
      });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const mensagem = String(body.mensagem || '').trim();
      if (!mensagem) return res.status(400).json({ erro: 'Escreva a mensagem.' });

      let payload;
      if (body.grupo) {
        payload = { grupo: String(body.grupo), mensagem };
      } else if (UUID_RE.test(String(body.membro || ''))) {
        const rows = await supabase(`/rest/v1/member_whatsapp?user_id=eq.${body.membro}&select=whatsapp`, token);
        if (!rows[0]) return res.status(404).json({ erro: 'Esse membro não tem WhatsApp cadastrado.' });
        payload = { numero: rows[0].whatsapp, mensagem };
      } else {
        return res.status(400).json({ erro: 'Escolha um grupo ou um membro.' });
      }

      const sent = await corvus('/enviar', { method: 'POST', body: JSON.stringify(payload) });
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
