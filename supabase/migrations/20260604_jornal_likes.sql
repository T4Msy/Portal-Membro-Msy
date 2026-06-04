CREATE TABLE IF NOT EXISTS public.jornal_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.jornal_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_jornal_likes_post ON public.jornal_likes(post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jornal_likes_user ON public.jornal_likes(user_id, created_at DESC);

ALTER TABLE public.jornal_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros leem likes do Jornal" ON public.jornal_likes;
CREATE POLICY "Membros leem likes do Jornal"
  ON public.jornal_likes FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Membros curtem Jornal" ON public.jornal_likes;
CREATE POLICY "Membros curtem Jornal"
  ON public.jornal_likes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Membros removem curtida do Jornal" ON public.jornal_likes;
CREATE POLICY "Membros removem curtida do Jornal"
  ON public.jornal_likes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
