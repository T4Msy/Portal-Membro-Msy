-- ============================================================
-- Corvus Bot: tudo que os avisos automáticos precisam numa chamada só
--
-- Por quê: a cada minuto o bot (corvus-botv/src/automations.js) fazia de 8 a 12
-- consultas separadas (~14 mil requisições/dia, ~90% do tráfego da API). Cada uma
-- passa pelo gateway e pelo PostgREST, e na máquina Nano do plano Free isso pesa na
-- memória (o portal caiu em 06/11/2026). Agora o bot chama só POST /rpc/bot_tick_data.
--
-- Cada parte é lida num bloco próprio: se uma der erro (ex.: coluna renomeada no
-- portal), ela volta vazia, o nome dela entra em "errors" e as outras continuam.
--
-- Segurança: devolve os WhatsApps dos membros, então só a chave de serviço do bot
-- (service_role) pode chamar. anon e authenticated ficam sem permissão.
--
-- Se o bot precisar de um campo novo, mudar AQUI e em automations.js (os dois lados).
-- Aplicado no SQL Editor em 07/11/2026.
-- ============================================================

create or replace function public.bot_tick_data()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  today   date        := (now() at time zone 'America/Sao_Paulo')::date;
  since   timestamptz := now() - interval '30 minutes';  -- NEW_WINDOW_MS do bot
  result  jsonb       := '{}'::jsonb;
  errors  text[]      := '{}';
  part    jsonb;
begin
  -- Configuração dos avisos (Central do Bot)
  begin
    select coalesce(jsonb_agg(to_jsonb(a)), '[]') into part
      from public.bot_automations a where a.enabled;
    result := result || jsonb_build_object('automations', part);
  exception when others then
    errors := array_append(errors, 'automations'); result := result || '{"automations": []}';
  end;

  begin
    part := (select to_jsonb(s) from (select default_group, default_group_name from public.bot_settings where id = 1) s);
    result := result || jsonb_build_object('settings', coalesce(part, '{}'));
  exception when others then
    errors := array_append(errors, 'settings'); result := result || '{"settings": {}}';
  end;

  -- Membros ativos (nomes, aniversários) e quem recebe no WhatsApp
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', p.id, 'name', p.name, 'birth_date', p.birth_date, 'join_date', p.join_date,
             'avatar_url', p.avatar_url, 'initials', p.initials, 'color', p.color)), '[]') into part
      from public.profiles p where p.status = 'ativo';
    result := result || jsonb_build_object('members', part);
  exception when others then
    errors := array_append(errors, 'members'); result := result || '{"members": []}';
  end;

  begin
    select coalesce(jsonb_agg(jsonb_build_object('user_id', w.user_id, 'whatsapp', w.whatsapp)), '[]') into part
      from public.member_whatsapp w where w.receive;
    result := result || jsonb_build_object('contacts', part);
  exception when others then
    errors := array_append(errors, 'contacts'); result := result || '{"contacts": []}';
  end;

  -- Eventos públicos de ontem até daqui a 60 dias + respostas de presença
  begin
    with ev as (
      select e.id, e.title, e.description, e.event_date, e.event_time, e.created_at
        from public.events e
       where e.status = 'ativo' and e.is_private = false
         and e.event_date between today - 1 and today + 60
    )
    select jsonb_build_object(
             'events', coalesce((select jsonb_agg(to_jsonb(ev)) from ev), '[]'),
             'event_presencas', coalesce((
               select jsonb_agg(jsonb_build_object('event_id', p.event_id, 'membro_id', p.membro_id, 'user_id', p.user_id,
                                                   'status', p.status, 'response_status', p.response_status))
                 from public.event_presencas p where p.event_id in (select id from ev)), '[]'))
      into part;
    result := result || part;
  exception when others then
    errors := array_append(errors, 'events'); result := result || '{"events": [], "event_presencas": []}';
  end;

  -- Atividades novas ou com prazo de ontem em diante + colaboradores e entregas
  begin
    with act as (
      select a.id, a.title, a.assigned_to, a.assigned_by, a.deadline, a.deadline_time,
             a.extended_deadline, a.extended_deadline_time, a.status, a.created_at
        from public.activities a
       where a.created_at >= since or a.deadline >= today - 1 or a.extended_deadline >= today - 1
    ), open_ids as (
      select id from act where status is null or status not in ('Concluída', 'Incompleta', 'Cancelada')
    )
    select jsonb_build_object(
             'activities', coalesce((select jsonb_agg(to_jsonb(act)) from act), '[]'),
             'activity_collaborators', coalesce((
               select jsonb_agg(jsonb_build_object('activity_id', c.activity_id, 'user_id', c.user_id))
                 from public.activity_collaborators c where c.activity_id in (select id from open_ids)), '[]'),
             'activity_responses', coalesce((
               select jsonb_agg(jsonb_build_object('activity_id', r.activity_id, 'user_id', r.user_id))
                 from public.activity_responses r where r.activity_id in (select id from open_ids)), '[]'))
      into part;
    result := result || part;
  exception when others then
    errors := array_append(errors, 'activities');
    result := result || '{"activities": [], "activity_collaborators": [], "activity_responses": []}';
  end;

  -- Reuniões agendadas + participantes
  begin
    with m as (
      select s.id, s.title, s.meeting_date, s.meeting_time, s.created_at, s.status
        from public.scheduled_meetings s
       where s.status = 'agendada' and (s.created_at >= since or s.meeting_date >= today - 1)
    )
    select jsonb_build_object(
             'meetings', coalesce((select jsonb_agg(to_jsonb(m)) from m), '[]'),
             'meeting_participants', coalesce((
               select jsonb_agg(jsonb_build_object('meeting_id', p.meeting_id, 'user_id', p.user_id))
                 from public.scheduled_meeting_participants p where p.meeting_id in (select id from m)), '[]'))
      into part;
    result := result || part;
  exception when others then
    errors := array_append(errors, 'meetings'); result := result || '{"meetings": [], "meeting_participants": []}';
  end;

  -- Comunicados dos últimos 30 minutos
  begin
    select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'content', c.content,
                                                 'category', c.category, 'created_at', c.created_at)), '[]') into part
      from public.comunicados c where c.created_at >= since;
    result := result || jsonb_build_object('comunicados', part);
  exception when others then
    errors := array_append(errors, 'comunicados'); result := result || '{"comunicados": []}';
  end;

  return result || jsonb_build_object('errors', to_jsonb(errors));
end;
$$;

revoke execute on function public.bot_tick_data() from public, anon, authenticated;
grant execute on function public.bot_tick_data() to service_role;
