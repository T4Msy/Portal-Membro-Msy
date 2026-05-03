import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_KEY  = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL  = 'MSY Portal <noreply@portalmsy.site>'
const UUID_RE     = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const serviceClient = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

function err(status: number, msg: string): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function sanitize(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return err(405, 'Method not allowed')
  }

  // ── Verificar JWT do chamador ──────────────────────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return err(401, 'Token de autenticação ausente')
  }
  const token = authHeader.slice(7)

  const callerClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  )
  const { data: { user }, error: userErr } = await callerClient.auth.getUser()
  if (userErr || !user) {
    return err(401, 'Token inválido ou expirado')
  }

  // ── Verificar se o chamador é diretoria ───────────────
  const { data: prof } = await serviceClient
    .from('profiles')
    .select('tier')
    .eq('id', user.id)
    .single()

  if (prof?.tier !== 'diretoria') {
    return err(403, 'Acesso restrito à diretoria')
  }

  // ── Parsear e validar body ─────────────────────────────
  let body: { userId?: string; all?: boolean; subject?: string; message?: string }
  try {
    body = await req.json()
  } catch {
    return err(400, 'JSON inválido')
  }

  const { userId, all, subject, message } = body

  if (!subject || !message) {
    return err(400, 'subject e message são obrigatórios')
  }
  if (!all && (!userId || !UUID_RE.test(userId))) {
    return err(400, 'userId deve ser um UUID válido quando all não for true')
  }

  // ── Buscar destinatários ───────────────────────────────
  let query = serviceClient
    .from('profiles')
    .select('id, name, notif_email_address')
    .eq('notif_email', true)

  if (!all && userId) query = query.eq('id', userId)

  const { data: members, error: dbErr } = await query
  if (dbErr) {
    return err(500, `Erro ao buscar membros: ${dbErr.message}`)
  }

  const safeSubject = sanitize(subject)
  const safeMessage = message.replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const sends = (members ?? []).map(async (m) => {
    let email = m.notif_email_address
    if (!email) {
      const { data: { user: u } } = await serviceClient.auth.admin.getUserById(m.id)
      email = u?.email
    }
    if (!email) return

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: safeSubject || 'Notificação — MSY Portal',
        html: `
          <div style="background:#07070a;color:#ececec;padding:32px;font-family:sans-serif;max-width:520px;margin:0 auto;border:1px solid rgba(201,168,76,0.2);border-radius:12px">
            <div style="font-size:1.4rem;font-weight:700;color:#c9a84c;margin-bottom:16px">MSY Portal</div>
            <p style="color:#ececec;font-size:0.95rem;line-height:1.7">${safeMessage}</p>
            <a href="https://www.portalmsy.site"
               style="display:inline-block;margin-top:20px;padding:10px 22px;background:#b91c1c;color:#fff;text-decoration:none;border-radius:8px;font-size:0.85rem;font-weight:600">
              Abrir Portal →
            </a>
            <p style="color:#666;font-size:0.72rem;margin-top:24px">Masayoshi Order · Para desativar, acesse Perfil → Notificações</p>
          </div>
        `,
      }),
    })
  })

  await Promise.allSettled(sends)
  return new Response(JSON.stringify({ ok: true, sent: members?.length ?? 0 }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
