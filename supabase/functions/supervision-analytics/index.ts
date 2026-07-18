import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.49.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const err = (status: number, error: string) => new Response(JSON.stringify({ error }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST') return err(405, 'Method not allowed')
  const authorization = req.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return err(401, 'Token ausente')

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: authorization } } })
  const { data: { user }, error: userError } = await caller.auth.getUser()
  if (userError || !user) return err(401, 'Token invalido')
  const { data: permitted, error: accessError } = await caller.rpc('can_access_supervision')
  if (accessError || permitted !== true) return err(403, 'Acesso restrito a Supervisao')

  let body: { chat?: string, inicio?: string, fim?: string, mode?: 'weekly' | 'monthly', fileName?: string }
  try { body = await req.json() } catch { return err(400, 'JSON invalido') }
  if (!body.chat || !body.inicio || !body.fim || !['weekly', 'monthly'].includes(body.mode ?? '')) return err(400, 'Informe chat, inicio, fim e mode')
  if (body.chat.length > 35 * 1024 * 1024) return err(413, 'Arquivo excede o limite de 35 MB')

  const n8nUrl = Deno.env.get('MSY_N8N_ANALYTICS_URL')
  if (!n8nUrl) return err(503, 'Integracao MSY Analytics nao configurada')
  let analysis: { metrics?: Array<{ member_name: string, metric_date: string, message_count: number }>, unmatched_names?: string[] }
  try {
    const response = await fetch(n8nUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-MSY-Source': 'supervision' }, body: JSON.stringify({ chat: body.chat, inicio: body.inicio, fim: body.fim, mode: body.mode }) })
    if (!response.ok) return err(502, `MSY Analytics respondeu HTTP ${response.status}`)
    analysis = await response.json()
  } catch (cause) {
    console.error('[MSY][supervision-analytics] n8n', cause)
    return err(502, 'Nao foi possivel processar a importacao no MSY Analytics')
  }
  const metrics = Array.isArray(analysis.metrics) ? analysis.metrics : []
  if (!metrics.length) return err(422, 'O MSY Analytics nao retornou metricas estruturadas')
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${body.inicio}|${body.fim}|${body.chat}`)))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  const { data: imported, error: importError } = await service.from('supervision_analytics_imports').insert({ period_start: body.inicio, period_end: body.fim, mode: body.mode, file_name: body.fileName ?? null, checksum: hash, unmatched_names: analysis.unmatched_names ?? [], imported_by: user.id }).select('id').single()
  if (importError) return err(importError.code === '23505' ? 409 : 500, importError.code === '23505' ? 'Este periodo e arquivo ja foram importados.' : 'Falha ao registrar importacao')
  const { data: profiles } = await service.from('profiles').select('id,name').eq('status', 'ativo')
  const byName = new Map((profiles ?? []).map((profile) => [profile.name.trim().toLocaleLowerCase('pt-BR'), profile.id]))
  const rows = metrics.map((metric) => ({ import_id: imported.id, member_id: byName.get(metric.member_name.trim().toLocaleLowerCase('pt-BR')) ?? null, member_name: metric.member_name.trim(), metric_date: metric.metric_date, message_count: Math.max(0, Number(metric.message_count) || 0) }))
  const { error: metricError } = await service.from('supervision_message_metrics').insert(rows)
  if (metricError) return err(500, 'Falha ao salvar metricas da importacao')
  await service.from('supervision_timeline').insert({ event_type: 'analytics_imported', title: 'MSY Analytics atualizado', description: `${rows.length} metricas importadas para ${body.mode === 'weekly' ? 'analise semanal' : 'analise mensal'}.`, actor_id: user.id, source_type: 'analytics_import', source_id: imported.id })
  return new Response(JSON.stringify({ importId: imported.id, metricCount: rows.length, unmatchedNames: analysis.unmatched_names ?? [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
