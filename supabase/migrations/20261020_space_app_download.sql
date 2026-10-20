-- MSY Space: download do app Android dentro do Space (docs/msy-space/APP_ANDROID.md).
-- Bucket PRIVADO: só quem tem acesso ao Space baixa (link assinado); só a gestão do Space envia versões novas.
-- Limite de 50 MB por arquivo (limite do plano grátis do Supabase; o APK tem ~47 MB).

insert into storage.buckets (id, name, public, file_size_limit)
values ('space-app', 'space-app', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists space_app_read on storage.objects;
create policy space_app_read on storage.objects for select to authenticated
  using (bucket_id = 'space-app' and public.space_can_access());

drop policy if exists space_app_insert on storage.objects;
create policy space_app_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'space-app' and public.space_can_manage());

drop policy if exists space_app_update on storage.objects;
create policy space_app_update on storage.objects for update to authenticated
  using (bucket_id = 'space-app' and public.space_can_manage())
  with check (bucket_id = 'space-app' and public.space_can_manage());

drop policy if exists space_app_delete on storage.objects;
create policy space_app_delete on storage.objects for delete to authenticated
  using (bucket_id = 'space-app' and public.space_can_manage());
