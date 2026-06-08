-- Restricts social comment deletion to the comment author or the owner of the post.
-- Replaces the broader moderation/admin rule in delete_social_comment.

DROP POLICY IF EXISTS "Autores editam comentarios" ON public.social_comments;
CREATE POLICY "Autores editam comentarios"
  ON public.social_comments FOR UPDATE
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

DROP FUNCTION IF EXISTS public.delete_social_comment(uuid);

CREATE OR REPLACE FUNCTION public.delete_social_comment(p_comment_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comment_author uuid;
  v_post_author uuid;
BEGIN
  SELECT c.author_id, p.author_id
    INTO v_comment_author, v_post_author
  FROM public.social_comments c
  JOIN public.social_posts p ON p.id = c.post_id
  WHERE c.id = p_comment_id
    AND c.deleted_at IS NULL
    AND p.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Comentário não encontrado.';
  END IF;

  IF auth.uid() IS NULL
    OR (auth.uid() <> v_comment_author AND auth.uid() <> v_post_author)
  THEN
    RAISE EXCEPTION 'Sem permissão para excluir este comentário.';
  END IF;

  UPDATE public.social_comments
  SET deleted_at = now(),
      updated_at = now()
  WHERE id = p_comment_id
    AND deleted_at IS NULL;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_social_comment(uuid) TO authenticated;
