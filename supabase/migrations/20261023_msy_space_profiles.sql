-- Perfis sociais exclusivos do MSY Space. Não altera public.profiles do Portal.
create table if not exists public.space_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  display_name text check (display_name is null or char_length(btrim(display_name)) between 2 and 32),
  bio text not null default '' check (char_length(bio) <= 190),
  accent_color text not null default '#a855f7' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  avatar_path text,
  banner_path text,
  updated_at timestamptz not null default now()
);

alter table public.space_profiles enable row level security;
drop policy if exists space_profiles_read on public.space_profiles;
create policy space_profiles_read on public.space_profiles for select to authenticated
  using (public.space_can_access());
drop policy if exists space_profiles_insert on public.space_profiles;
create policy space_profiles_insert on public.space_profiles for insert to authenticated
  with check (user_id = auth.uid() and public.space_can_access());
drop policy if exists space_profiles_update on public.space_profiles;
create policy space_profiles_update on public.space_profiles for update to authenticated
  using (user_id = auth.uid() and public.space_can_access())
  with check (user_id = auth.uid() and public.space_can_access());
grant select, insert, update on public.space_profiles to authenticated;
revoke all on public.space_profiles from anon, public;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('space-profile-media', 'space-profile-media', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists space_profile_media_insert on storage.objects;
create policy space_profile_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'space-profile-media' and public.space_can_access()
    and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists space_profile_media_update on storage.objects;
create policy space_profile_media_update on storage.objects for update to authenticated
  using (bucket_id = 'space-profile-media' and public.space_can_access()
    and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'space-profile-media' and public.space_can_access()
    and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists space_profile_media_delete on storage.objects;
create policy space_profile_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'space-profile-media' and public.space_can_access()
    and (storage.foldername(name))[1] = auth.uid()::text);
