-- =============================================================================
-- MSY Space — "Discord da Masayoshi" dentro do portal (ver docs/msy-space/README.md)
-- Portado do esquema da Masayoshi-Plataforma, adaptado ao portal:
--   * membros = public.profiles do portal (sem cadastro/aprovação próprios)
--   * acesso  = permissão 'acessar_space' (diretoria já passa em has_permission)
--   * gestão  = permissão 'gerenciar_space'
--   * tudo com prefixo space_ para não colidir com tabelas/funções do portal
-- Seguro para rodar mais de uma vez.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Tabelas
-- -----------------------------------------------------------------------------
create table if not exists public.space_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.space_channels (
  id              uuid primary key default gen_random_uuid(),
  category_id     uuid references public.space_categories (id) on delete set null,
  name            text not null check (char_length(btrim(name)) between 1 and 40),
  kind            text not null check (kind in ('text', 'voice')),
  position        integer not null default 0,
  is_private      boolean not null default false,
  user_limit      integer not null default 15 check (user_limit between 2 and 25),
  is_temporary    boolean not null default false,
  join_code       text unique check (join_code ~ '^[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  created_by      uuid references public.profiles (id) on delete set null,
  last_active_at  timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  constraint space_channels_temp_shape
    check (not is_temporary or (kind = 'voice' and join_code is not null and category_id is null and not is_private))
);
create index if not exists space_channels_category_idx on public.space_channels (category_id);

-- Quem pode entrar num canal privado OU já entrou numa sala com código.
create table if not exists public.space_channel_members (
  channel_id  uuid not null references public.space_channels (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  added_by    uuid references public.profiles (id) on delete set null,
  joined_at   timestamptz not null default now(),
  primary key (channel_id, user_id)
);
create index if not exists space_channel_members_user_idx on public.space_channel_members (user_id);

create table if not exists public.space_messages (
  id            uuid primary key default gen_random_uuid(),
  channel_id    uuid not null references public.space_channels (id) on delete cascade,
  author_id     uuid references public.profiles (id) on delete set null,
  content       text not null check (char_length(btrim(content)) between 1 and 4000),
  client_nonce  uuid not null,
  created_at    timestamptz not null default now(),
  edited_at     timestamptz,
  constraint space_messages_nonce_unique unique (author_id, client_nonce)
);
create index if not exists space_messages_channel_created_idx on public.space_messages (channel_id, created_at desc, id desc);

-- Preferências de voz (dispositivos, volumes, preset de tela). Separado do profile do portal.
create table if not exists public.space_preferences (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  preferences  jsonb not null default '{}'::jsonb check (pg_column_size(preferences) <= 4096),
  updated_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Funções de autorização (security definer + search_path vazio)
-- -----------------------------------------------------------------------------
create or replace function public.space_can_access()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'ativo')
     and public.has_permission('acessar_space')
$$;

create or replace function public.space_can_manage()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.space_can_access() and public.has_permission('gerenciar_space')
$$;

create or replace function public.space_can_access_channel(cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.space_can_access() and exists (
    select 1 from public.space_channels c
    where c.id = cid
      and (
        public.space_can_manage()
        or c.created_by = auth.uid()
        or (not c.is_private and not c.is_temporary)
        or exists (select 1 from public.space_channel_members m where m.channel_id = c.id and m.user_id = auth.uid())
      )
  )
$$;

-- -----------------------------------------------------------------------------
-- Mensagens: data de edição e limite de envio (10 por 10 s)
-- -----------------------------------------------------------------------------
create or replace function public.space_messages_before_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.content is distinct from old.content then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists space_messages_set_edited on public.space_messages;
create trigger space_messages_set_edited
  before update on public.space_messages
  for each row execute function public.space_messages_before_update();

create or replace function public.space_messages_rate_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (
    select count(*) from public.space_messages
    where author_id = new.author_id and created_at > now() - interval '10 seconds'
  ) >= 10 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists space_messages_rate_limit on public.space_messages;
create trigger space_messages_rate_limit
  before insert on public.space_messages
  for each row execute function public.space_messages_rate_limit();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.space_categories      enable row level security;
alter table public.space_channels        enable row level security;
alter table public.space_channel_members enable row level security;
alter table public.space_messages        enable row level security;
alter table public.space_preferences     enable row level security;

revoke all on public.space_categories, public.space_channels, public.space_channel_members,
  public.space_messages, public.space_preferences from anon;

drop policy if exists space_categories_select on public.space_categories;
create policy space_categories_select on public.space_categories for select to authenticated
  using (public.space_can_access());
drop policy if exists space_categories_write on public.space_categories;
create policy space_categories_write on public.space_categories for all to authenticated
  using (public.space_can_manage()) with check (public.space_can_manage());

drop policy if exists space_channels_select on public.space_channels;
create policy space_channels_select on public.space_channels for select to authenticated
  using (public.space_can_access_channel(id));
-- Canais fixos: só a gestão cria/edita. Salas com código só pelas funções abaixo.
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

drop policy if exists space_messages_select on public.space_messages;
create policy space_messages_select on public.space_messages for select to authenticated
  using (public.space_can_access_channel(channel_id));
drop policy if exists space_messages_insert on public.space_messages;
create policy space_messages_insert on public.space_messages for insert to authenticated
  with check (
    author_id = auth.uid()
    and edited_at is null
    and public.space_can_access_channel(channel_id)
    and exists (select 1 from public.space_channels c where c.id = channel_id and c.kind = 'text')
  );
drop policy if exists space_messages_update_own on public.space_messages;
create policy space_messages_update_own on public.space_messages for update to authenticated
  using (author_id = auth.uid() and public.space_can_access_channel(channel_id))
  with check (author_id = auth.uid());
drop policy if exists space_messages_delete on public.space_messages;
create policy space_messages_delete on public.space_messages for delete to authenticated
  using (public.space_can_access_channel(channel_id) and (author_id = auth.uid() or public.space_can_manage()));

drop policy if exists space_preferences_own on public.space_preferences;
create policy space_preferences_own on public.space_preferences for all to authenticated
  using (user_id = auth.uid() and public.space_can_access())
  with check (user_id = auth.uid() and public.space_can_access());

-- -----------------------------------------------------------------------------
-- Salas com código (XXXX-XXXX): somem quando ficam vazias
-- -----------------------------------------------------------------------------
create or replace function public.space_normalize_code(raw text)
returns text language sql immutable set search_path = '' as $$
  select case when raw is null then null else (
    with c as (select upper(regexp_replace(raw, '[^A-Za-z0-9]', '', 'g')) as v)
    select case when char_length(v) = 8 then substr(v, 1, 4) || '-' || substr(v, 5, 4) else v end from c
  ) end
$$;

create or replace function public.space_generate_code()
returns text language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- sem 0/O/1/I
  bytes bytea := extensions.gen_random_bytes(8);
  out_code text := '';
  i int;
begin
  for i in 0..7 loop
    out_code := out_code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
    if i = 3 then out_code := out_code || '-'; end if;
  end loop;
  return out_code;
end;
$$;

-- Remove salas com código sem atividade há 30 minutos.
create or replace function public.space_cleanup_rooms()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  delete from public.space_channels where is_temporary and last_active_at < now() - interval '30 minutes';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Criar sala: devolve id e código. Até 3 salas por pessoa.
create or replace function public.space_create_room(p_name text)
returns table (id uuid, join_code text) language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
  v_id uuid;
  v_name text := left(btrim(coalesce(p_name, '')), 40);
begin
  if not public.space_can_access() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  perform public.space_cleanup_rooms();
  if (select count(*) from public.space_channels c where c.is_temporary and c.created_by = auth.uid()) >= 3 then
    raise exception 'ROOM_LIMIT' using errcode = 'P0001';
  end if;
  if char_length(v_name) = 0 then
    v_name := left('Sala de ' || coalesce((select p.name from public.profiles p where p.id = auth.uid()), 'membro'), 40);
  end if;
  loop
    v_code := public.space_generate_code();
    exit when not exists (select 1 from public.space_channels c where c.join_code = v_code);
  end loop;
  insert into public.space_channels (name, kind, is_temporary, join_code, created_by, user_limit, position)
  values (v_name, 'voice', true, v_code, auth.uid(), 15, 0)
  returning space_channels.id into v_id;
  insert into public.space_channel_members (channel_id, user_id, added_by) values (v_id, auth.uid(), auth.uid());
  return query select v_id, v_code;
end;
$$;

create or replace function public.space_join_room(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not public.space_can_access() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select c.id into v_id from public.space_channels c
  where c.is_temporary and c.join_code = public.space_normalize_code(p_code);
  if v_id is null then
    raise exception 'ROOM_NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.space_channel_members (channel_id, user_id) values (v_id, auth.uid())
  on conflict do nothing;
  update public.space_channels set last_active_at = now() where id = v_id;
  return v_id;
end;
$$;

-- Sinal de vida enquanto alguém está na sala.
create or replace function public.space_touch_room(p_channel uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.space_can_access_channel(p_channel) then
    update public.space_channels set last_active_at = now() where id = p_channel and is_temporary;
  end if;
end;
$$;

-- O último a sair marca como vazia: é removida na próxima limpeza (a não ser que alguém volte).
create or replace function public.space_mark_room_empty(p_channel uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.space_can_access_channel(p_channel) then
    update public.space_channels set last_active_at = now() - interval '29 minutes'
    where id = p_channel and is_temporary;
  end if;
end;
$$;

create or replace function public.space_delete_room(p_channel uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.space_channels c
    where c.id = p_channel and c.is_temporary
      and (c.created_by = auth.uid() or public.space_can_manage())
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  delete from public.space_channels where id = p_channel;
end;
$$;

-- Apagar todas as mensagens de um canal (gestão).
create or replace function public.space_purge_channel(p_channel uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  if not public.space_can_manage() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  delete from public.space_messages where channel_id = p_channel;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- -----------------------------------------------------------------------------
-- Realtime: tópicos privados do Space
--   space:online            presença global (quem está no Space / em qual sala)
--   space:workspace         mudanças de estrutura (canais, categorias, membros de sala)
--   space:chat:<uuid>       mensagens de um canal de texto
--   space:voice:<uuid>      sinalização WebRTC + presença da sala de voz
-- -----------------------------------------------------------------------------
create or replace function public.space_realtime_topic_allowed(p_topic text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  uuid_re constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  cid uuid;
begin
  if p_topic in ('space:online', 'space:workspace') then
    return public.space_can_access();
  end if;
  if p_topic ~ ('^space:chat:' || uuid_re || '$') then
    cid := substr(p_topic, 12)::uuid;
    return public.space_can_access_channel(cid)
       and exists (select 1 from public.space_channels where id = cid and kind = 'text');
  end if;
  if p_topic ~ ('^space:voice:' || uuid_re || '$') then
    cid := substr(p_topic, 13)::uuid;
    return public.space_can_access_channel(cid)
       and exists (select 1 from public.space_channels where id = cid and kind = 'voice');
  end if;
  return false;
end;
$$;

drop policy if exists space_realtime_receive on realtime.messages;
create policy space_realtime_receive on realtime.messages for select to authenticated
  using (public.space_realtime_topic_allowed((select realtime.topic())));
drop policy if exists space_realtime_send on realtime.messages;
create policy space_realtime_send on realtime.messages for insert to authenticated
  with check (public.space_realtime_topic_allowed((select realtime.topic())));

-- Eventos de banco (postgres_changes) das tabelas do Space. RLS filtra por usuário.
do $$
declare t text;
begin
  foreach t in array array['space_messages', 'space_channels', 'space_categories', 'space_channel_members'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Permissões de execução
-- -----------------------------------------------------------------------------
revoke execute on function public.space_can_access(), public.space_can_manage(), public.space_can_access_channel(uuid),
  public.space_create_room(text), public.space_join_room(text), public.space_touch_room(uuid),
  public.space_mark_room_empty(uuid), public.space_delete_room(uuid), public.space_purge_channel(uuid),
  public.space_realtime_topic_allowed(text), public.space_cleanup_rooms(), public.space_generate_code(),
  public.space_normalize_code(text), public.space_messages_rate_limit()
  from anon, public;
grant execute on function public.space_can_access(), public.space_can_manage(), public.space_can_access_channel(uuid),
  public.space_create_room(text), public.space_join_room(text), public.space_touch_room(uuid),
  public.space_mark_room_empty(uuid), public.space_delete_room(uuid), public.space_purge_channel(uuid),
  public.space_realtime_topic_allowed(text)
  to authenticated;

-- Limpeza automática das salas com código a cada 10 minutos (pg_cron).
create extension if not exists pg_cron;
select cron.unschedule('space-cleanup-rooms') where exists (select 1 from cron.job where jobname = 'space-cleanup-rooms');
select cron.schedule('space-cleanup-rooms', '*/10 * * * *', $$select public.space_cleanup_rooms()$$);

-- -----------------------------------------------------------------------------
-- Estrutura inicial (só se ainda não houver canais)
-- -----------------------------------------------------------------------------
do $$
declare
  cat_text uuid;
  cat_voice uuid;
begin
  if exists (select 1 from public.space_channels) then return; end if;
  insert into public.space_categories (name, position) values ('Texto', 0) returning id into cat_text;
  insert into public.space_categories (name, position) values ('Voz', 1) returning id into cat_voice;
  insert into public.space_channels (category_id, name, kind, position) values
    (cat_text, 'geral', 'text', 0),
    (cat_text, 'avisos', 'text', 1),
    (cat_voice, 'Sala Geral', 'voice', 0),
    (cat_voice, 'Reunião', 'voice', 1);
end $$;
