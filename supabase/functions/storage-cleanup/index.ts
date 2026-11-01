// Limpeza diária de arquivos órfãos do Storage (ver supabase/migrations/20261101_storage_orphan_cleanup.sql).
// Órfão = arquivo com mais de 7 dias que nenhuma tabela do banco cita (avatar trocado, resposta,
// atividade, post, story ou mensagem apagados, membro removido...).
//
// Chamada pelo pg_cron todo dia (sem login). Deploy com "Verify JWT" DESLIGADO: quem chama sem
// login só dispara a mesma limpeza do agendamento e recebe apenas os totais, nunca os caminhos.
// Diretoria logada pode mandar { "dry": true } para ver a lista do que seria apagado, sem apagar.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

type Orphan = { bucket: string; name: string; size: number }

const MIN_AGE = '7 days'
const MAX_PER_RUN = 300
// Se "órfãos" passarem disso do total, algo deu errado na leitura do banco: não apaga nada.
const MAX_ORPHAN_RATIO = 0.6
const CHUNK = 100

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let isDiretoria = false
  const authHeader = req.headers.get('Authorization') ?? ''
  if (authHeader.startsWith('Bearer ')) {
    const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data } = await asUser.rpc('is_diretoria')
    isDiretoria = data === true
  }
  const body = await req.json().catch(() => ({})) as { dry?: boolean }
  const dry = isDiretoria && body.dry === true

  try {
    const { data, error } = await admin.rpc('storage_orphan_files', { p_min_age: MIN_AGE })
    if (error) throw error
    const total = Number(data?.total ?? 0)
    const orphans = (data?.orphans ?? []) as Orphan[]

    if (!total || orphans.length / total > MAX_ORPHAN_RATIO) {
      console.error('[MSY][storage-cleanup] Abortado: proporção de órfãos suspeita', { total, orphans: orphans.length })
      return json({ ok: false, error: 'Proporção de órfãos suspeita, nada foi apagado.', total, orphans: orphans.length }, 409)
    }

    const batch = orphans.slice(0, MAX_PER_RUN)
    const bytes = batch.reduce((sum, o) => sum + (o.size || 0), 0)
    if (dry) return json({ ok: true, dry: true, total, orphans: orphans.length, bytes, files: batch })

    const byBucket = new Map<string, string[]>()
    for (const o of batch) byBucket.set(o.bucket, [...(byBucket.get(o.bucket) ?? []), o.name])

    let removed = 0
    const failures: string[] = []
    for (const [bucket, names] of byBucket) {
      for (let i = 0; i < names.length; i += CHUNK) {
        const { data: gone, error: rmErr } = await admin.storage.from(bucket).remove(names.slice(i, i + CHUNK))
        if (rmErr) failures.push(`${bucket}: ${rmErr.message}`)
        else removed += gone?.length ?? 0
      }
    }

    console.log('[MSY][storage-cleanup]', { total, removed, bytes, files: batch.map((o) => `${o.bucket}/${o.name}`) })
    return json({ ok: failures.length === 0, total, removed, bytes, remaining: orphans.length - batch.length, failures })
  } catch (err) {
    console.error('[MSY][storage-cleanup]', err)
    return json({ ok: false, error: 'Falha na limpeza.' }, 500)
  }
})
