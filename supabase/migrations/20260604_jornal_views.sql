CREATE TABLE IF NOT EXISTS public.jornal_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.jornal_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_jornal_views_post ON public.jornal_views(post_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_jornal_views_user ON public.jornal_views(user_id, viewed_at DESC);

ALTER TABLE public.jornal_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros leem views do Jornal" ON public.jornal_views;
CREATE POLICY "Membros leem views do Jornal"
  ON public.jornal_views FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Membros registram view do Jornal" ON public.jornal_views;
CREATE POLICY "Membros registram view do Jornal"
  ON public.jornal_views FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
