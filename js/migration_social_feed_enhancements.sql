-- ============================================================
-- MSY PORTAL — SOCIAL FEED ENHANCEMENTS
-- Edicao de posts/stories, abas privadas do perfil, ordem de
-- stories e limpeza de storage pelo frontend.
-- Execute no Supabase Dashboard > SQL Editor apos as migrations sociais.
-- ============================================================

ALTER TABLE public.social_stories
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS elements jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_social_stories_author_sequence
  ON public.social_stories(author_id, created_at ASC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_social_saved_posts_user_created
  ON public.social_saved_posts(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_likes_user_post_created
  ON public.social_likes(user_id, created_at DESC)
  WHERE target_type = 'post';

DROP FUNCTION IF EXISTS public.delete_social_post(uuid);
CREATE OR REPLACE FUNCTION public.delete_social_post(p_post_id uuid)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author uuid;
  v_storage_paths text[];
BEGIN
  SELECT author_id INTO v_author
  FROM public.social_posts
  WHERE id = p_post_id
    AND is_deleted = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Publicação não encontrada.';
  END IF;

  IF auth.uid() IS NULL OR (auth.uid() <> v_author AND NOT public.is_diretoria()) THEN
    RAISE EXCEPTION 'Sem permissão para excluir esta publicação.';
  END IF;

  SELECT COALESCE(array_agg(storage_path), ARRAY[]::text[])
    INTO v_storage_paths
  FROM public.social_post_media
  WHERE post_id = p_post_id
    AND storage_path IS NOT NULL;

  UPDATE public.social_posts
  SET is_deleted = true,
      updated_at = now(),
      edited_at = COALESCE(edited_at, now())
  WHERE id = p_post_id;

  RETURN v_storage_paths;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_social_post(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_social_liked_post_ids(
  p_profile_id uuid,
  p_limit integer DEFAULT 24
) RETURNS TABLE(post_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sl.post_id
  FROM public.social_likes sl
  JOIN public.social_posts sp ON sp.id = sl.post_id
  WHERE sl.user_id = p_profile_id
    AND sl.target_type = 'post'
    AND sl.post_id IS NOT NULL
    AND sp.is_deleted = false
    AND (auth.uid() = p_profile_id OR public.is_diretoria())
  ORDER BY sl.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 24), 1), 60);
$$;

CREATE OR REPLACE FUNCTION public.get_social_saved_post_ids(
  p_profile_id uuid,
  p_limit integer DEFAULT 24
) RETURNS TABLE(post_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ssp.post_id
  FROM public.social_saved_posts ssp
  JOIN public.social_posts sp ON sp.id = ssp.post_id
  WHERE ssp.user_id = p_profile_id
    AND sp.is_deleted = false
    AND (auth.uid() = p_profile_id OR public.is_diretoria())
  ORDER BY ssp.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 24), 1), 60);
$$;

GRANT EXECUTE ON FUNCTION public.get_social_liked_post_ids(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_social_saved_post_ids(uuid, integer) TO authenticated;

DROP POLICY IF EXISTS "Membros gerenciam saves" ON public.social_saved_posts;
CREATE POLICY "Membros gerenciam saves"
  ON public.social_saved_posts FOR ALL
  USING (auth.uid() = user_id OR public.is_diretoria())
  WITH CHECK (auth.uid() = user_id OR public.is_diretoria());

DROP POLICY IF EXISTS "Autores gerenciam stories" ON public.social_stories;
CREATE POLICY "Autores gerenciam stories"
  ON public.social_stories FOR UPDATE
  USING (auth.uid() = author_id OR public.is_diretoria())
  WITH CHECK (auth.uid() = author_id OR public.is_diretoria());
