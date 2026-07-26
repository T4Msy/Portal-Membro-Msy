import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.49.4'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const secret = Deno.env.get('SUPERVISION_SWEEP_SECRET')
  if (!secret || req.headers.get('x-supervision-cron') !== secret) return json({ error: 'Unauthorized' }, 401)
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const now = new Date()
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const in3d = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
  const today = now.toISOString().slice(0, 10)
  const tomorrow = in24h.toISOString().slice(0, 10)
  const threeDays = in3d.toISOString().slice(0, 10)
  const paymentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [{ data: activities }, { data: events }, { data: profiles }, { data: openAssignments }, { data: activityHistory }, { data: projectTaskHistory }, { data: openProjectAssignments }, { data: projects }, { data: payments }, { data: eventHistory }, { data: presenceHistory }, { data: messageMetrics }] = await Promise.all([
    db.from('activities').select('id,title,deadline,deadline_time,status,assigned_to').not('status', 'in', '(Concluída,Cancelada,Em andamento)').not('deadline', 'is', null),
    db.from('events').select('id,title,event_date,event_time,status').gte('event_date', today).lte('event_date', threeDays).not('status', 'in', '(concluido,cancelado)'),
    db.from('profiles').select('id,name,role').eq('status', 'ativo'),
    db.from('activities').select('assigned_to').not('status', 'in', '(Concluída,Cancelada)').not('assigned_to', 'is', null),
    db.from('activities').select('assigned_to,created_at,closes_at,deadline,deadline_time,status').not('assigned_to', 'is', null).order('created_at', { ascending: false }).limit(5000),
    db.from('project_tasks').select('assigned_to,updated_at').eq('status', 'concluida').not('assigned_to', 'is', null).order('updated_at', { ascending: false }).limit(5000),
    db.from('project_tasks').select('assigned_to').neq('status', 'concluida').not('assigned_to', 'is', null),
    db.from('projects').select('id,name,updated_at,status').not('status', 'in', '(concluido,cancelado)'),
    db.from('mensalidades').select('user_id,status').eq('mes_referencia', paymentMonth),
    db.from('events').select('id,title,event_date,event_time,status').order('event_date', { ascending: false }).limit(1000),
    db.from('event_presencas').select('event_id,membro_id,user_id,status,response_status,justificativa_status,attendance_status').limit(10000),
    db.from('supervision_message_metrics').select('member_id,metric_date,message_count').gte('metric_date', new Date(now.getTime() - 60 * 86_400_000).toISOString().slice(0, 10)).limit(20000),
  ])
  const reminders = [] as Record<string, unknown>[]
  for (const activity of activities ?? []) {
    const due = new Date(`${activity.deadline}T${activity.deadline_time || '23:59'}:00`)
    if (due <= in24h) reminders.push({ fingerprint: `activity:${activity.id}:${activity.deadline}`, title: due < now ? `Atividade atrasada: ${activity.title}` : `Cobrar atividade proxima do prazo: ${activity.title}`, description: due < now ? 'A atividade passou do prazo e precisa de acompanhamento.' : `Expira em menos de 24 horas (${due.toLocaleString('pt-BR')}).`, category: 'activity', origin: 'automatic', approval_status: 'pending_approval', due_at: due.toISOString(), source_type: 'activity', source_id: activity.id })
  }
  for (const event of events ?? []) {
    const eventAt = new Date(`${event.event_date}T${event.event_time || '12:00'}:00`)
    reminders.push({ fingerprint: `event-message:${event.id}`, title: `Comunicar proximo evento: ${event.title}`, description: `Prepare a divulgacao antes do evento em ${eventAt.toLocaleString('pt-BR')}.`, category: 'event_message', origin: 'automatic', approval_status: 'pending_approval', due_at: eventAt.toISOString(), source_type: 'event', source_id: event.id, whatsapp_message: `Pessoal, lembrando que teremos ${event.title} no dia ${event.event_date}${event.event_time ? ` as ${event.event_time}` : ''}. Contamos com voces!` })
  }
  for (const project of projects ?? []) {
    const updated = project.updated_at ? new Date(project.updated_at) : null
    if (updated && now.getTime() - updated.getTime() >= 7 * 86_400_000) {
      reminders.push({ fingerprint: `project-stalled:${project.id}:${today}`, title: `Projeto sem movimentacao: ${project.name}`, description: 'O projeto esta sem atualizacao ha pelo menos 7 dias. Verifique o responsavel e o proximo passo.', category: 'task', origin: 'automatic', approval_status: 'pending_approval', source_type: 'project', source_id: project.id })
    }
  }
  const paidUsers = new Set((payments ?? []).filter((payment) => ['pago', 'confirmado'].includes(String(payment.status || '').toLowerCase())).map((payment) => payment.user_id))
  for (const profile of profiles ?? []) {
    if (!paidUsers.has(profile.id)) reminders.push({ fingerprint: `finance:${profile.id}:${paymentMonth}`, title: `Confirmar mensalidade: ${profile.name}`, description: `Nao ha pagamento confirmado para ${paymentMonth}.`, category: 'finance', origin: 'automatic', approval_status: 'pending_approval', source_type: 'profile', source_id: profile.id })
  }
  let written = 0
  for (const reminder of reminders) {
    const { data: existing } = await db.from('supervision_reminders').select('id').eq('fingerprint', reminder.fingerprint).maybeSingle()
    if (existing) continue
    const { data: created, error } = await db.from('supervision_reminders').insert(reminder).select('id,title,description,due_at,category,approval_status').single()
    if (!error && created) {
      written++
      await db.rpc('upsert_supervision_case', {
        p_source_type: 'reminder', p_source_id: created.id, p_source_key: created.id,
        p_priority: created.category === 'finance' ? 'info' : (created.approval_status === 'pending_approval' ? 'attention' : 'info'),
        p_title: created.title, p_description: created.description, p_member_id: null, p_due_at: created.due_at,
      })
    }
  }
  const overdue = (activities ?? []).filter((activity) => new Date(`${activity.deadline}T${activity.deadline_time || '23:59'}:00`) < now)
  let observations = 0
  const recordObservation = async (fingerprint: string, title: string, body: string, evidence: Record<string, unknown>) => {
    const { error } = await db.from('supervision_observations').upsert({ fingerprint, title, body, origin: 'automatic', evidence: { ...evidence, scannedAt: now.toISOString() } }, { onConflict: 'fingerprint', ignoreDuplicates: true })
    if (!error) observations++
  }
  if (overdue.length >= 3) {
    const { error } = await db.from('supervision_observations').upsert({
      fingerprint: `overdue-activities:${today}`,
      title: 'Acumulo de atividades atrasadas',
      body: `${overdue.length} atividades permanecem fora do prazo. Priorize a cobranca e a redistribuicao das entregas.`,
      origin: 'automatic',
      evidence: { overdueActivities: overdue.length, scannedAt: now.toISOString() },
    }, { onConflict: 'fingerprint', ignoreDuplicates: true })
    if (!error) observations++
  }
  const activeAssignments = new Set([...(openAssignments ?? []), ...(openProjectAssignments ?? [])].map((activity) => activity.assigned_to).filter(Boolean))
  for (const profile of profiles ?? []) {
    if (activeAssignments.has(profile.id)) continue
    const { error } = await db.from('supervision_observations').upsert({
      fingerprint: `member-without-activities:${profile.id}`,
      title: 'Membro sem atividades abertas',
      body: `${profile.name} nao possui nenhuma atividade aberta atribuida neste momento. Verifique se precisa de uma nova responsabilidade.`,
      origin: 'automatic',
      evidence: { memberId: profile.id, scannedAt: now.toISOString() },
    }, { onConflict: 'fingerprint', ignoreDuplicates: true })
    if (!error) observations++
  }
  const historyByMember = new Map<string, number>()
  for (const activity of activityHistory ?? []) {
    const timestamp = new Date(activity.closes_at || activity.created_at).getTime()
    if (Number.isNaN(timestamp)) continue
    historyByMember.set(activity.assigned_to, Math.max(historyByMember.get(activity.assigned_to) || 0, timestamp))
  }
  for (const task of projectTaskHistory ?? []) {
    const timestamp = new Date(task.updated_at).getTime()
    if (!Number.isNaN(timestamp)) historyByMember.set(task.assigned_to, Math.max(historyByMember.get(task.assigned_to) || 0, timestamp))
  }
  const eventById = new Map((eventHistory ?? []).map((event) => [event.id, event]))
  const attendanceByEvent = new Map<string, Set<string>>()
  for (const presence of presenceHistory ?? []) {
    const memberId = presence.membro_id || presence.user_id
    const attendance = String(presence.attendance_status || presence.status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    const response = String(presence.response_status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    if (!memberId || (!['presente', 'confirmado'].includes(attendance) && !['participar'].includes(response))) continue
    const members = attendanceByEvent.get(presence.event_id) || new Set<string>()
    members.add(memberId)
    attendanceByEvent.set(presence.event_id, members)
  }
  const strongestEvent = [...attendanceByEvent.entries()].sort((a, b) => b[1].size - a[1].size)[0]
  if (strongestEvent) {
    const event = eventById.get(strongestEvent[0])
    await recordObservation(`event-highest-attendance:${today}`, 'Evento com maior participacao', `${event?.title || 'Um evento recente'} concentrou ${strongestEvent[1].size} presencas registradas. Use esse formato como referencia para futuras programacoes.`, { eventId: strongestEvent[0], attendance: strongestEvent[1].size })
  }
  const hourCounts = new Map<string, number>()
  for (const [eventId, members] of attendanceByEvent) {
    const event = eventById.get(eventId)
    const hour = event?.event_time ? String(event.event_time).slice(0, 2) : null
    if (hour) hourCounts.set(hour, (hourCounts.get(hour) || 0) + members.size)
  }
  const strongestHour = [...hourCounts.entries()].sort((a, b) => b[1] - a[1])[0]
  if (strongestHour) await recordObservation(`participation-hour:${today}`, 'Horario de maior participacao', `Eventos iniciados por volta das ${strongestHour[0]}h somaram a maior participacao observada no historico recente.`, { hour: strongestHour[0], participation: strongestHour[1] })
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]))
  const lateByRole = new Map<string, number>()
  for (const activity of activityHistory ?? []) {
    if (String(activity.status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() !== 'concluida' || !activity.closes_at || !activity.deadline) continue
    const completedAt = new Date(activity.closes_at).getTime()
    const deadline = new Date(`${activity.deadline}T${activity.deadline_time || '23:59'}:00`).getTime()
    if (completedAt <= deadline) continue
    const role = profileById.get(activity.assigned_to)?.role || 'Sem setor informado'
    lateByRole.set(role, (lateByRole.get(role) || 0) + 1)
  }
  const slowestRole = [...lateByRole.entries()].sort((a, b) => b[1] - a[1])[0]
  if (slowestRole) await recordObservation(`role-late-delivery:${today}`, 'Setor com mais entregas tardias', `${slowestRole[0]} concentrou ${slowestRole[1]} entrega${slowestRole[1] === 1 ? '' : 's'} fora do prazo no periodo analisado.`, { role: slowestRole[0], lateDeliveries: slowestRole[1] })
  const recentMetrics = new Map<string, number>(); const previousMetrics = new Map<string, number>()
  const recentStart = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10); const previousStart = new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10)
  for (const metric of messageMetrics ?? []) {
    const target = metric.metric_date >= recentStart ? recentMetrics : metric.metric_date >= previousStart ? previousMetrics : null
    if (target && metric.member_id) target.set(metric.member_id, (target.get(metric.member_id) || 0) + (Number(metric.message_count) || 0))
  }
  const improved = [...recentMetrics.entries()].map(([memberId, recent]) => ({ memberId, recent, previous: previousMetrics.get(memberId) || 0 })).filter((item) => item.recent > item.previous && item.recent >= 100).sort((a, b) => (b.recent - b.previous) - (a.recent - a.previous))[0]
  if (improved) {
    const profile = profileById.get(improved.memberId)
    await recordObservation(`member-improved:${today}`, 'Membro em evolucao', `${profile?.name || 'Um membro'} aumentou a movimentacao de ${improved.previous} para ${improved.recent} mensagens na comparacao entre as duas ultimas semanas.`, { memberId: improved.memberId, previous: improved.previous, recent: improved.recent })
  }
  let inactivityAlerts = 0
  for (const profile of profiles ?? []) {
    const latest = historyByMember.get(profile.id)
    const daysWithoutActivity = latest ? Math.floor((now.getTime() - latest) / 86_400_000) : 10
    const fingerprint = `member-activity-inactive:${profile.id}`
    if (daysWithoutActivity < 10) {
      await db.from('supervision_alerts').update({ status: 'resolved', resolved_at: now.toISOString(), updated_at: now.toISOString() }).eq('fingerprint', fingerprint).in('status', ['open', 'acknowledged'])
      continue
    }
    const { data: alert, error } = await db.from('supervision_alerts').upsert({
      fingerprint,
      severity: 'attention',
      title: 'Membro sem movimentacao em atividades',
      description: latest ? `${profile.name} esta ha ${daysWithoutActivity} dias sem movimentacao em atividades.` : `${profile.name} ainda nao possui movimentacao em atividades registrada.`,
      source_type: 'member_activity_inactive',
      member_id: profile.id,
      status: 'open',
      updated_at: now.toISOString(),
    }, { onConflict: 'fingerprint' }).select('id,title,description,member_id,severity').single()
    if (!error && alert) {
      inactivityAlerts++
      await db.rpc('upsert_supervision_case', {
        p_source_type: 'alert', p_source_id: alert.id, p_source_key: alert.id,
        p_priority: alert.severity, p_title: alert.title, p_description: alert.description,
        p_member_id: alert.member_id, p_due_at: null,
      })
    }
  }
  return json({ scannedAt: now.toISOString(), candidates: reminders.length, created: written, observations, inactivityAlerts })
})
