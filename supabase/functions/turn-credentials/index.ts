// Credenciais TURN para o MSY Space (ver docs/msy-space/README.md, seção TURN).
// O TURN é o "intermediário" que faz a chamada funcionar quando a conexão direta é bloqueada
// (4G/5G, redes de empresa). As credenciais ficam nos Secrets do Supabase, nunca no site, e só
// são entregues para quem tem acesso ao Space (public.space_can_access()).
//
// Secrets aceitos (configure UM dos dois jeitos):
//   Credencial fixa (ex.: ExpressTURN):
//     TURN_URLS        -> "turn:host:3478,turn:host:3478?transport=tcp" (separe por vírgula)
//     TURN_USERNAME    -> usuário
//     TURN_CREDENTIAL  -> senha
//   Metered (Open Relay), credencial gerada pela API deles:
//     METERED_APP      -> subdomínio do app (ex.: "masayoshi" para masayoshi.metered.live)
//     METERED_API_KEY  -> chave da API
// Sem nenhum configurado, responde lista vazia e o Space segue só com STUN.
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

type IceServer = { urls: string | string[]; username?: string; credential?: string }

const TTL_SECONDS = 4 * 60 * 60

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: allowed, error } = await supabase.rpc('space_can_access')
  if (error || allowed !== true) return json({ error: 'Forbidden' }, 403)

  // 1) Credencial fixa (ExpressTURN e similares)
  const urls = (Deno.env.get('TURN_URLS') ?? '').split(',').map((u) => u.trim()).filter(Boolean)
  const username = Deno.env.get('TURN_USERNAME')
  const credential = Deno.env.get('TURN_CREDENTIAL')
  if (urls.length && username && credential) {
    return json({ iceServers: [{ urls, username, credential }], ttl: TTL_SECONDS })
  }

  // 2) Metered: gera credenciais pela API
  const app = Deno.env.get('METERED_APP')
  const apiKey = Deno.env.get('METERED_API_KEY')
  if (app && apiKey) {
    try {
      const res = await fetch(`https://${app}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`)
      if (!res.ok) return json({ iceServers: [], ttl: 0, error: `TURN ${res.status}` })
      const list = (await res.json()) as IceServer[]
      // Só os servidores TURN (o STUN o Space já tem).
      const turn = (Array.isArray(list) ? list : []).filter((s) =>
        (Array.isArray(s.urls) ? s.urls : [s.urls]).some((u) => u.startsWith('turn')))
      return json({ iceServers: turn, ttl: TTL_SECONDS })
    } catch (e) {
      console.error('[MSY][turn-credentials] Metered', e)
      return json({ iceServers: [], ttl: 0, error: 'TURN indisponível' })
    }
  }

  return json({ iceServers: [], ttl: 0 })
})
