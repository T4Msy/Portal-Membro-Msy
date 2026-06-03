DROP POLICY IF EXISTS "Membros removem propria reaction story" ON public.social_story_reactions;

CREATE POLICY "Membros removem propria reaction story"
  ON public.social_story_reactions FOR DELETE
  USING (auth.uid() = user_id);

