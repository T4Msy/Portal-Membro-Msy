-- ============================================================
-- Limpeza automática de arquivos órfãos do Storage
-- Arquivo "órfão" = nenhuma tabela do schema public cita o nome dele
-- (sobrou de avatar trocado, resposta/atividade/post/story/mensagem
-- apagados, membro removido...). Quem apaga é a Edge Function
-- storage-cleanup (o Supabase bloqueia DELETE direto em storage.objects).
-- Aplicar no Supabase SQL Editor.
-- ============================================================

-- Lista os órfãos com mais de p_min_age. Só o service_role (Edge Function) executa.
-- Compara pelo nome final do arquivo (ex.: avatar_1775931557912.jpg) contra o texto
-- de todas as linhas de todas as tabelas do public: se aparecer em qualquer lugar
-- (URL, path, JSON), o arquivo fica.
CREATE OR REPLACE FUNCTION public.storage_orphan_files(p_min_age interval DEFAULT interval '7 days')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
  v_refs text;
  v_total int;
  v_orphans jsonb;
BEGIN
  SELECT string_agg(query_to_xml(format('select * from %I.%I', table_schema, table_name), false, false, '')::text, ' ')
    INTO v_refs
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

  IF v_refs IS NULL OR length(v_refs) < 1000 THEN
    RAISE EXCEPTION 'storage_orphan_files: leitura das tabelas veio vazia, abortando';
  END IF;

  SELECT count(*) INTO v_total FROM storage.objects WHERE bucket_id <> 'space-app';

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'bucket', o.bucket_id,
           'name', o.name,
           'size', coalesce((o.metadata->>'size')::bigint, 0)
         ) ORDER BY o.bucket_id, o.name), '[]'::jsonb)
    INTO v_orphans
  FROM storage.objects o
  WHERE o.bucket_id <> 'space-app'                    -- APK e latest.json são lidos pelo código, não pelo banco
    AND o.created_at < now() - p_min_age             -- margem para rascunhos e uploads ainda sem linha no banco
    AND o.name !~ '(^|/)\.emptyFolderPlaceholder$'
    AND position(regexp_replace(o.name, '^.*/', '') IN v_refs) = 0;

  RETURN jsonb_build_object('total', v_total, 'orphans', v_orphans);
END;
$$;

REVOKE ALL ON FUNCTION public.storage_orphan_files(interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.storage_orphan_files(interval) TO service_role;

-- Roda todo dia às 07:00 UTC (04:00 em Brasília). A Edge Function precisa estar com
-- "Verify JWT" desligado, senão a chamada sem login volta 401 e nada é apagado.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.schedule('storage-orphan-cleanup', '0 7 * * *', $$
  select net.http_post(
    url := 'https://lldzgkxpoyqauxdcjyaw.supabase.co/functions/v1/storage-cleanup',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
$$);
