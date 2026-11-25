-- Duas travas que faltavam no banco (a tela do portal já não deixava, mas a API deixava):
-- 1) Membro comum não registra a própria presença, não revisa a própria justificativa e não
--    "vira presente" num evento que já passou. Quem tem permissão de presença/eventos e a diretoria seguem iguais.
-- 2) notify_member para TODOS (p_user_id nulo) só para diretoria e quem publica comunicados ou cria eventos;
--    visitante sem login (anon) não chama mais a função.
-- As travas valem só para escrita direta pela API (papel authenticated). Funções do banco com SECURITY DEFINER
-- (revisão de justificativa, exclusão de conta) e o service role não passam por elas. A função do gatilho é
-- SECURITY INVOKER de propósito: é o current_user = 'authenticated' que diz que a escrita veio da API.

create or replace function public.event_presencas_pode_gerenciar()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_diretoria()
      or public.has_permission('registrar_presencas_eventos') or public.has_permission('registrar_participantes')
      or public.has_permission('gerenciar_presencas') or public.has_permission('gerenciar_eventos')
      or public.has_permission('revisar_justificativas_eventos') or public.has_permission('cancelar_eventos');
$$;
revoke all on function public.event_presencas_pode_gerenciar() from public, anon;
grant execute on function public.event_presencas_pode_gerenciar() to authenticated, service_role;

-- Evento encerrado (data passou, concluído ou cancelado). DEFINER para enxergar também evento privado.
create or replace function public.evento_encerrado(p_event_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (e.event_date < (now() at time zone 'America/Sao_Paulo')::date) or e.status in ('concluido', 'cancelado')
                     from public.events e where e.id = p_event_id), false);
$$;
revoke all on function public.evento_encerrado(uuid) from public, anon;
grant execute on function public.evento_encerrado(uuid) to authenticated, service_role;

create or replace function public.event_presencas_trava_membro()
returns trigger language plpgsql set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_ev_id uuid := case when tg_op = 'DELETE' then old.event_id else new.event_id end;
  v_passou boolean;
begin
  if current_user <> 'authenticated' or v_uid is null or public.event_presencas_pode_gerenciar() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_passou := public.evento_encerrado(v_ev_id);

  if tg_op = 'DELETE' then
    if old.attendance_status is not null or old.justificativa_status in ('aceita', 'recusada') or v_passou then
      raise exception 'Presença registrada ou evento encerrado: só quem cuida dos eventos pode apagar.' using errcode = '42501';
    end if;
    return old;
  end if;

  -- Só a própria linha.
  if new.membro_id is distinct from v_uid or coalesce(new.user_id, v_uid) <> v_uid then
    raise exception 'Você só pode responder por você.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.attendance_status is not null or new.attendance_recorded_by is not null or new.attendance_recorded_at is not null
       or new.marcado_por is not null
       or new.justificativa_reviewed_by is not null or new.justificativa_reviewed_at is not null or new.justificativa_review_note is not null
       or coalesce(new.justificativa_status, 'pendente') <> 'pendente' then
      raise exception 'Presença e revisão de justificativa são registradas por quem cuida dos eventos.' using errcode = '42501';
    end if;
    if v_passou and (new.status = 'confirmado' or new.response_status = 'participar') then
      raise exception 'O evento já passou: não dá mais para confirmar presença.' using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.event_id is distinct from old.event_id or new.membro_id is distinct from old.membro_id
     or new.user_id is distinct from old.user_id and new.user_id is distinct from v_uid then
    raise exception 'Você só pode responder por você.' using errcode = '42501';
  end if;
  if new.attendance_status is distinct from old.attendance_status
     or new.attendance_recorded_by is distinct from old.attendance_recorded_by
     or new.attendance_recorded_at is distinct from old.attendance_recorded_at
     or new.marcado_por is distinct from old.marcado_por then
    raise exception 'Presença é registrada por quem cuida dos eventos.' using errcode = '42501';
  end if;
  if (new.justificativa_reviewed_by is distinct from old.justificativa_reviewed_by and new.justificativa_reviewed_by is not null)
     or (new.justificativa_reviewed_at is distinct from old.justificativa_reviewed_at and new.justificativa_reviewed_at is not null)
     or (new.justificativa_review_note is distinct from old.justificativa_review_note and new.justificativa_review_note is not null)
     or (new.justificativa_status is distinct from old.justificativa_status and new.justificativa_status in ('aceita', 'recusada')) then
    raise exception 'Justificativa é revisada por quem cuida dos eventos.' using errcode = '42501';
  end if;
  if v_passou then
    if old.justificativa_status in ('aceita', 'recusada') and new.justificativa_status is distinct from old.justificativa_status then
      raise exception 'Essa justificativa já foi revisada.' using errcode = '42501';
    end if;
    if (new.status = 'confirmado' and old.status is distinct from 'confirmado')
       or (new.response_status = 'participar' and old.response_status is distinct from 'participar') then
      raise exception 'O evento já passou: não dá mais para confirmar presença.' using errcode = '42501';
    end if;
    if old.attendance_status is not null and new.status is distinct from old.status
       and not (new.status = 'justificado' and new.justificativa_status = 'pendente') then
      raise exception 'Presença já registrada: fale com quem cuida dos eventos.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_event_presencas_trava_membro on public.event_presencas;
create trigger trg_event_presencas_trava_membro
  before insert or update or delete on public.event_presencas
  for each row execute function public.event_presencas_trava_membro();

-- 2) Notificação para todos só com permissão.
create or replace function public.notify_member(p_user_id uuid, p_message text, p_type text default 'info'::text, p_icon text default '🔔'::text, p_link text default null::text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user_id is null then
    if auth.uid() is not null and not (
         public.is_diretoria() or public.has_permission('publicar_comunicados') or public.has_permission('gerenciar_comunicados')
         or public.has_permission('criar_eventos') or public.has_permission('gerenciar_eventos')) then
      raise exception 'Sem permissão para notificar todos os membros.' using errcode = '42501';
    end if;
    insert into public.notifications (user_id, message, type, icon, link)
    select id, p_message, p_type, p_icon, p_link from public.profiles where status = 'ativo';
  else
    insert into public.notifications (user_id, message, type, icon, link)
    values (p_user_id, p_message, p_type, p_icon, p_link);
  end if;
end;
$$;
revoke all on function public.notify_member(uuid, text, text, text, text) from public, anon;
grant execute on function public.notify_member(uuid, text, text, text, text) to authenticated, service_role;
