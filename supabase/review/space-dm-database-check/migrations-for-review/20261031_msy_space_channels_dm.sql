-- MSY Space: canais administráveis e mensagens privadas individuais.
-- Aplicar manualmente no SQL Editor do projeto depois da revisão local.

-- Canais privados são visíveis apenas para a gestão e membros explicitamente autorizados.
create or replace function public.space_can_access_channel(cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.space_can_access() and exists (
    select 1 from public.space_channels c
    where c.id = cid
      and (public.space_can_manage()
        or (not c.is_private and not c.is_temporary)
        or exists (select 1 from public.space_channel_members m where m.channel_id = c.id and m.user_id = auth.uid()))
  )
$$;

-- Preferências existentes também guardam volumes individuais por membro; cabem pelo menos 200 entradas.
do $$ declare r record; begin
  for r in select conname from pg_constraint
    where conrelid = 'public.space_preferences'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%pg_column_size(preferences)%'
  loop execute format('alter table public.space_preferences drop constraint %I', r.conname); end loop;
end $$;
alter table public.space_preferences drop constraint if exists space_preferences_size_check;
alter table public.space_preferences add constraint space_preferences_size_check
  check (pg_column_size(preferences) <= 32768);

-- Mantém o criador de canais privados já existentes na lista explícita de autorizados.
insert into public.space_channel_members(channel_id, user_id, added_by)
select c.id, c.created_by, c.created_by from public.space_channels c
where c.is_private and c.created_by is not null
on conflict (channel_id, user_id) do nothing;

drop policy if exists space_messages_update_own on public.space_messages;
create policy space_messages_update_own on public.space_messages for update to authenticated
  using (author_id = auth.uid() and public.space_can_access_channel(channel_id))
  with check (author_id = auth.uid() and public.space_can_access_channel(channel_id)
    and exists (select 1 from public.space_channels c where c.id = channel_id and c.kind = 'text'));
drop policy if exists space_messages_select on public.space_messages;
create policy space_messages_select on public.space_messages for select to authenticated
  using (public.space_can_access_channel(channel_id)
    and exists (select 1 from public.space_channels c where c.id = channel_id and c.kind = 'text'));
drop policy if exists space_messages_delete on public.space_messages;
create policy space_messages_delete on public.space_messages for delete to authenticated
  using (public.space_can_access_channel(channel_id)
    and exists (select 1 from public.space_channels c where c.id = channel_id and c.kind = 'text')
    and (author_id = auth.uid() or public.space_can_manage()));

-- A lista de canais e as permissões de membros continuam subordinadas a gerenciar_space.
drop policy if exists space_channels_write on public.space_channels;
create policy space_channels_write on public.space_channels for all to authenticated
  using (public.space_can_manage() and not is_temporary)
  with check (public.space_can_manage() and not is_temporary);

drop policy if exists space_channel_members_select on public.space_channel_members;
create policy space_channel_members_select on public.space_channel_members for select to authenticated
  using (user_id = auth.uid() or public.space_can_manage());
drop policy if exists space_channel_members_write on public.space_channel_members;
create policy space_channel_members_write on public.space_channel_members for all to authenticated
  using (public.space_can_manage()) with check (public.space_can_manage());

-- DELETE Postgres Changes não é filtrado por RLS. Remova essa tabela da publicação e envie
-- somente um aviso genérico para atualizar listas; o aviso não revela canal nem membro.
do $$ begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
    and schemaname = 'public' and tablename = 'space_channel_members') then
    alter publication supabase_realtime drop table public.space_channel_members;
  end if;
end $$;

create or replace function public.space_channel_members_notify_workspace()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(
    payload := jsonb_build_object('refresh', true),
    event := 'membership_changed',
    topic := 'space:workspace',
    private := true
  );
  return null;
end;
$$;
drop trigger if exists space_channel_members_notify_workspace on public.space_channel_members;
create trigger space_channel_members_notify_workspace
  after insert or update or delete on public.space_channel_members
  for each statement execute function public.space_channel_members_notify_workspace();

-- Escrita transacional de canal + membros autorizados. Não aceita membros inativos nem IDs duplicados.
create or replace function public.space_save_channel(
  p_channel uuid, p_name text, p_kind text, p_category uuid, p_private boolean, p_members uuid[]
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_channel;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if not public.space_can_manage() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if char_length(v_name) not between 1 and 40 or p_kind not in ('text', 'voice') then
    raise exception 'INVALID_CHANNEL' using errcode = '22023';
  end if;
  if p_category is not null and not exists (select 1 from public.space_categories where id = p_category) then
    raise exception 'INVALID_CATEGORY' using errcode = '22023';
  end if;
  if p_members is not null and cardinality(p_members) > 200 then raise exception 'TOO_MANY_MEMBERS' using errcode = '22023'; end if;
  if p_members is not null and exists (
    select 1 from unnest(p_members) as selected(member_id)
    left join public.profiles p on p.id = selected.member_id
    where p.id is null or p.status <> 'ativo'
  ) then raise exception 'INVALID_MEMBER' using errcode = '22023'; end if;
  if p_channel is null then
    insert into public.space_channels (name, kind, category_id, is_private, created_by)
      values (v_name, p_kind, p_category, coalesce(p_private, false), auth.uid()) returning id into v_id;
  else
    if exists (select 1 from public.space_channels where id = p_channel and kind <> p_kind) then
      raise exception 'CHANNEL_KIND_FIXED' using errcode = '22023';
    end if;
    update public.space_channels set name = v_name, kind = p_kind, category_id = p_category,
      is_private = coalesce(p_private, false)
      where id = p_channel and not is_temporary;
    if not found then raise exception 'CHANNEL_NOT_FOUND' using errcode = 'P0002'; end if;
  end if;
  if coalesce(p_private, false) then
    delete from public.space_channel_members where channel_id = v_id;
    insert into public.space_channel_members (channel_id, user_id, added_by)
      values (v_id, auth.uid(), auth.uid()) on conflict (channel_id, user_id) do nothing;
    insert into public.space_channel_members (channel_id, user_id, added_by)
      select v_id, selected.member_id, auth.uid() from unnest(coalesce(p_members, array[]::uuid[])) as selected(member_id)
      on conflict (channel_id, user_id) do nothing;
  else
    delete from public.space_channel_members where channel_id = v_id;
  end if;
  return v_id;
end;
$$;

create table if not exists public.space_dm_conversations (
  id uuid primary key default gen_random_uuid(),
  user_one uuid not null references public.profiles(id) on delete cascade,
  user_two uuid not null references public.profiles(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  constraint space_dm_distinct_users check (user_one < user_two),
  constraint space_dm_pair_unique unique(user_one, user_two)
);
create index if not exists space_dm_conversations_one_idx on public.space_dm_conversations(user_one, last_message_at desc);
create index if not exists space_dm_conversations_two_idx on public.space_dm_conversations(user_two, last_message_at desc);

create table if not exists public.space_dm_participants (
  conversation_id uuid not null references public.space_dm_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists space_dm_participants_user_idx on public.space_dm_participants(user_id, conversation_id);

create table if not exists public.space_dm_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.space_dm_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 4000),
  client_nonce uuid not null,
  created_at timestamptz not null default now(),
  constraint space_dm_messages_nonce_unique unique(conversation_id, sender_id, client_nonce)
);
create index if not exists space_dm_messages_page_idx on public.space_dm_messages(conversation_id, created_at desc, id desc);

alter table public.space_dm_conversations enable row level security;
alter table public.space_dm_participants enable row level security;
alter table public.space_dm_messages enable row level security;
revoke all on public.space_dm_conversations, public.space_dm_participants, public.space_dm_messages from anon, authenticated;
grant select on public.space_dm_conversations, public.space_dm_participants, public.space_dm_messages to authenticated;
grant insert on public.space_dm_messages to authenticated;

drop policy if exists space_dm_conversations_select on public.space_dm_conversations;
create policy space_dm_conversations_select on public.space_dm_conversations for select to authenticated
  using (public.space_can_access() and exists (select 1 from public.space_dm_participants p where p.conversation_id = id and p.user_id = auth.uid()));
drop policy if exists space_dm_participants_select on public.space_dm_participants;
create policy space_dm_participants_select on public.space_dm_participants for select to authenticated
  using (public.space_can_access() and user_id = auth.uid());
drop policy if exists space_dm_messages_select on public.space_dm_messages;
create policy space_dm_messages_select on public.space_dm_messages for select to authenticated
  using (public.space_can_access() and exists (select 1 from public.space_dm_participants p where p.conversation_id = space_dm_messages.conversation_id and p.user_id = auth.uid()));
drop policy if exists space_dm_messages_insert on public.space_dm_messages;
create policy space_dm_messages_insert on public.space_dm_messages for insert to authenticated
  with check (sender_id = auth.uid() and public.space_can_access() and exists (
    select 1 from public.space_dm_participants p where p.conversation_id = space_dm_messages.conversation_id and p.user_id = auth.uid()
  ));

create or replace function public.space_dm_list_conversations()
returns table(conversation_id uuid, peer_user_id uuid, last_message_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.id, case when c.user_one = auth.uid() then c.user_two else c.user_one end, c.last_message_at
  from public.space_dm_conversations c
  where public.space_can_access() and auth.uid() in (c.user_one, c.user_two)
  order by c.last_message_at desc;
$$;

create or replace function public.space_dm_start(p_peer uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_one uuid := least(auth.uid(), p_peer);
  v_two uuid := greatest(auth.uid(), p_peer);
  v_id uuid;
begin
  if not public.space_can_access() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_peer is null or p_peer = auth.uid() then raise exception 'INVALID_PEER' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_peer and p.status = 'ativo' and (
    p.tier = 'diretoria' or exists (
      select 1 from public.member_permissions mp where mp.user_id = p.id and mp.permissions @> array['acessar_space']::text[]
    )
  )) then
    raise exception 'INVALID_PEER' using errcode = '22023';
  end if;
  insert into public.space_dm_conversations(user_one, user_two, created_by)
    values (v_one, v_two, auth.uid()) on conflict (user_one, user_two) do nothing returning id into v_id;
  if v_id is null then select id into v_id from public.space_dm_conversations where user_one = v_one and user_two = v_two; end if;
  insert into public.space_dm_participants(conversation_id, user_id) values (v_id, v_one), (v_id, v_two) on conflict do nothing;
  return v_id;
end;
$$;

create or replace function public.space_dm_messages_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.space_dm_conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$;
drop trigger if exists space_dm_messages_after_insert on public.space_dm_messages;
create trigger space_dm_messages_after_insert after insert on public.space_dm_messages
  for each row execute function public.space_dm_messages_after_insert();

create or replace function public.space_realtime_topic_allowed(p_topic text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  uuid_re constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  cid uuid;
begin
  if p_topic in ('space:online', 'space:workspace') then return public.space_can_access(); end if;
  if p_topic ~ ('^space:chat:' || uuid_re || '$') then
    cid := substr(p_topic, 12)::uuid;
    return public.space_can_access_channel(cid) and exists (select 1 from public.space_channels where id = cid and kind = 'text');
  end if;
  if p_topic ~ ('^space:voice:' || uuid_re || '$') then
    cid := substr(p_topic, 13)::uuid;
    return public.space_can_access_channel(cid) and exists (select 1 from public.space_channels where id = cid and kind = 'voice');
  end if;
  if p_topic ~ ('^space:dm:' || uuid_re || '$') then
    cid := substr(p_topic, 10)::uuid;
    return public.space_can_access() and exists (
      select 1 from public.space_dm_participants p where p.conversation_id = cid and p.user_id = auth.uid()
    );
  end if;
  if p_topic ~ ('^space:dm-inbox:' || uuid_re || '$') then
    cid := substr(p_topic, 16)::uuid;
    return public.space_can_access() and cid = auth.uid();
  end if;
  return false;
end;
$$;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'space_dm_messages') then
    alter publication supabase_realtime add table public.space_dm_messages;
  end if;
end $$;

revoke execute on function public.space_save_channel(uuid, text, text, uuid, boolean, uuid[]),
  public.space_dm_list_conversations(), public.space_dm_start(uuid), public.space_realtime_topic_allowed(text),
  public.space_channel_members_notify_workspace()
  from public, anon, authenticated;
grant execute on function public.space_save_channel(uuid, text, text, uuid, boolean, uuid[]),
  public.space_dm_list_conversations(), public.space_dm_start(uuid), public.space_realtime_topic_allowed(text)
  to authenticated;

