-- ============================================================
-- Limpeza de órfãos no Cloudflare R2 (Worker msy-media)
-- O Worker lista o R2 e pergunta ao banco quais nomes de arquivo NÃO aparecem em
-- nenhuma tabela do public; esses (com mais de 7 dias) são apagados.
-- Recebe os nomes e devolve só os sem uso — não lista arquivos por conta própria.
-- Só a diretoria executa: o Worker chama com o token de quem está logado
-- (a limpeza roda quando alguém da diretoria abre o portal, no máximo 1x por dia).
-- Mesma comparação de storage_orphan_files (20261101_storage_orphan_cleanup.sql).
-- Aplicar no Supabase SQL Editor.
-- ============================================================

CREATE OR REPLACE FUNCTION public.media_unreferenced(p_names text[])
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_refs text;
BEGIN
  IF NOT public.is_diretoria() THEN
    RAISE EXCEPTION 'media_unreferenced: só a diretoria';
  END IF;
  IF coalesce(array_length(p_names, 1), 0) = 0 THEN
    RETURN ARRAY[]::text[];
  END IF;
  IF array_length(p_names, 1) > 1000 THEN
    RAISE EXCEPTION 'media_unreferenced: no máximo 1000 nomes por chamada';
  END IF;

  SELECT string_agg(query_to_xml(format('select * from %I.%I', table_schema, table_name), false, false, '')::text, ' ')
    INTO v_refs
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

  IF v_refs IS NULL OR length(v_refs) < 1000 THEN
    RAISE EXCEPTION 'media_unreferenced: leitura das tabelas veio vazia, abortando';
  END IF;

  RETURN ARRAY(
    SELECT DISTINCT n FROM unnest(p_names) AS n
    WHERE n ~ '^[A-Za-z0-9._-]+$' AND position(n IN v_refs) = 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.media_unreferenced(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.media_unreferenced(text[]) TO authenticated, service_role;
