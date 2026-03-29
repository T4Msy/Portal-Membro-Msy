import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL = 'MSY Portal <noreply@portalmsy.site>'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

Deno.serve(async (req) => {
  const { userId, all, subject, message } = await req.json()

  let query = supabase
    .from('profiles')
    .select('id, name, notif_email_address')
    .eq('notif_email', true)

  if (!all && userId) query = query.eq('id', userId)

  const { data: members, error: dbError } = await query
  console.log('Members encontrados:', members?.length, dbError)

  const sends = (members || []).map(async (m) => {
    let email = m.notif_email_address
    if (!email) {
      const { data: { user } } = await supabase.auth.admin.getUserById(m.id)
      email = user?.email
    }
    if (!email) {
      console.log('Sem email para membro:', m.id)
      return
    }

    console.log('Enviando para:', email)

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: subject || 'Notificação — MSY Portal',
        html: `
          <div style="background:#07070a;color:#ececec;padding:32px;font-family:sans-serif;max-width:520px;margin:0 auto;border:1px solid rgba(201,168,76,0.2);border-radius:12px">
            <div style="font-size:1.4rem;font-weight:700;color:#c9a84c;margin-bottom:16px">MSY Portal</div>
            <p style="color:#ececec;font-size:0.95rem;line-height:1.7">${message}</p>
            <a href="https://www.portalmsy.site"
               style="display:inline-block;margin-top:20px;padding:10px 22px;background:#b91c1c;color:#fff;text-decoration:none;border-radius:8px;font-size:0.85rem;font-weight:600">
              Abrir Portal →
            </a>
            <p style="color:#666;font-size:0.72rem;margin-top:24px">Masayoshi Order · Para desativar, acesse Perfil → Notificações</p>
          </div>
        `,
      }),
    })

    const resBody = await res.json()
    console.log('Resend status:', res.status, JSON.stringify(resBody))
  })

  await Promise.allSettled(sends)
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
})
