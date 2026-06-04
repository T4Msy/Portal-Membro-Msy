-- Feed: only the original author can edit a post.
-- Moderation/delete permissions remain handled by their own policies/functions.

DROP POLICY IF EXISTS "Autores editam posts sociais" ON public.social_posts;
CREATE POLICY "Autores editam posts sociais"
  ON public.social_posts FOR UPDATE
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Autores gerenciam midias dos posts" ON public.social_post_media;

DROP POLICY IF EXISTS "Autores atualizam midias dos posts" ON public.social_post_media;
CREATE POLICY "Autores atualizam midias dos posts"
  ON public.social_post_media FOR UPDATE
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Autores removem midias dos posts" ON public.social_post_media;
CREATE POLICY "Autores removem midias dos posts"
  ON public.social_post_media FOR DELETE
  USING (auth.uid() = author_id);
