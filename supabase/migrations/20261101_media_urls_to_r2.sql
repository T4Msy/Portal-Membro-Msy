-- ============================================================
-- Arquivos públicos migrados para o Cloudflare R2 (Worker msy-media)
-- Troca as URLs públicas do Supabase Storage pelas do Worker nos 4 buckets
-- que foram para o R2. Os caminhos são os mesmos (só muda o domínio/prefixo).
-- Pode rodar de novo sem problema (só pega o que ainda aponta para o Supabase).
-- Aplicar no Supabase SQL Editor.
-- ============================================================

DO $$
DECLARE
  v_from text := 'https://lldzgkxpoyqauxdcjyaw.supabase.co/storage/v1/object/public/';
  v_to   text := 'https://msy-media.miguelalvesmm08.workers.dev/';
  v_buckets text[] := ARRAY['activity-files', 'social-media', 'jornal-media', 'space-profile-media'];
  r record;
  b text;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name, c.data_type
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      AND c.data_type IN ('text', 'character varying', 'jsonb', 'json')
  LOOP
    FOREACH b IN ARRAY v_buckets LOOP
      IF r.data_type IN ('jsonb', 'json') THEN
        EXECUTE format('UPDATE public.%I SET %I = replace(%I::text, %L, %L)::%s WHERE %I::text LIKE %L',
          r.table_name, r.column_name, r.column_name, v_from || b || '/', v_to || b || '/', r.data_type,
          r.column_name, '%' || v_from || b || '/%');
      ELSE
        EXECUTE format('UPDATE public.%I SET %I = replace(%I, %L, %L) WHERE %I LIKE %L',
          r.table_name, r.column_name, r.column_name, v_from || b || '/', v_to || b || '/',
          r.column_name, '%' || v_from || b || '/%');
      END IF;
    END LOOP;
  END LOOP;
END $$;
