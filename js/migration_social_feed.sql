-- ============================================================
-- MSY PORTAL — MIGRATION SOCIAL FEED
-- Rede social interna: posts, midias, comentarios, stories,
-- follows, mensagens, saves e notificacoes contextuais.
-- Execute no Supabase Dashboard > SQL Editor.
-- ============================================================

-- ── PERFIL SOCIAL ─────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS banner_url text,
  ADD COLUMN IF NOT EXISTS social_bio text,
  ADD COLUMN IF NOT EXISTS social_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS profile_highlights jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_unique
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL AND username <> '';

-- ── POSTS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text,
  visibility text NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal')),
  is_pinned boolean NOT NULL DEFAULT false,
  is_deleted boolean NOT NULL DEFAULT false,
  edited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_posts_created ON public.social_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_posts_author ON public.social_posts(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_posts_pinned ON public.social_posts(is_pinned, created_at DESC);

CREATE TABLE IF NOT EXISTS public.social_post_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  url text NOT NULL,
  storage_path text,
  media_type text NOT NULL CHECK (media_type IN ('image','video')),
  width integer,
  height integer,
  position integer NOT NULL DEFAULT 0,
  alt_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_post_media_post ON public.social_post_media(post_id, position);

-- ── COMENTARIOS E LIKES ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.social_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.social_comments(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_comments_post ON public.social_comments(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_social_comments_parent ON public.social_comments(parent_id, created_at);

CREATE TABLE IF NOT EXISTS public.social_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('post','comment')),
  post_id uuid REFERENCES public.social_posts(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES public.social_comments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (target_type = 'post' AND post_id IS NOT NULL AND comment_id IS NULL)
    OR
    (target_type = 'comment' AND comment_id IS NOT NULL AND post_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_social_likes_post_unique
  ON public.social_likes(user_id, post_id)
  WHERE target_type = 'post';

CREATE UNIQUE INDEX IF NOT EXISTS idx_social_likes_comment_unique
  ON public.social_likes(user_id, comment_id)
  WHERE target_type = 'comment';

CREATE TABLE IF NOT EXISTS public.social_saved_posts (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

-- ── FOLLOWS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.social_follows (
  follower_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);

CREATE INDEX IF NOT EXISTS idx_social_follows_following ON public.social_follows(following_id);

-- ── STORIES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.social_stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  media_url text NOT NULL,
  storage_path text,
  media_type text NOT NULL CHECK (media_type IN ('image','video')),
  caption text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_stories_active ON public.social_stories(expires_at, created_at DESC);

CREATE TABLE IF NOT EXISTS public.social_story_views (
  story_id uuid NOT NULL REFERENCES public.social_stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.social_story_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.social_stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

WITH duplicated_reactions AS (
  SELECT id,
         row_number() OVER (PARTITION BY story_id, user_id ORDER BY created_at DESC, id DESC) AS rn
  FROM public.social_story_reactions
)
DELETE FROM public.social_story_reactions r
USING duplicated_reactions d
WHERE r.id = d.id AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_social_story_reactions_unique
  ON public.social_story_reactions(story_id, user_id);

-- ── MENSAGENS INTERNAS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.social_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id uuid REFERENCES public.social_posts(id) ON DELETE SET NULL,
  story_id uuid REFERENCES public.social_stories(id) ON DELETE SET NULL,
  body text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (sender_id <> recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_social_messages_recipient ON public.social_messages(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_messages_sender ON public.social_messages(sender_id, created_at DESC);

-- ── NOTIFICACOES CONTEXTUAIS ──────────────────────────────
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_type text,
  ADD COLUMN IF NOT EXISTS target_id uuid,
  ADD COLUMN IF NOT EXISTS target_url text,
  ADD COLUMN IF NOT EXISTS anchor text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_notifications_context
  ON public.notifications(user_id, target_type, target_id, created_at DESC);

-- Funcao opcional para eventos sociais disparados pelo frontend.
CREATE OR REPLACE FUNCTION public.notify_social(
  p_user_id uuid,
  p_actor_id uuid,
  p_message text,
  p_type text DEFAULT 'social',
  p_icon text DEFAULT '🔔',
  p_target_type text DEFAULT NULL,
  p_target_id uuid DEFAULT NULL,
  p_target_url text DEFAULT NULL,
  p_anchor text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_user_id = p_actor_id THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.notifications (
    user_id, actor_id, message, type, icon, link,
    target_type, target_id, target_url, anchor, metadata
  )
  VALUES (
    p_user_id, p_actor_id, p_message, p_type, p_icon, p_target_url,
    p_target_type, p_target_id, p_target_url, p_anchor, COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_social(uuid, uuid, text, text, text, text, uuid, text, text, jsonb) TO authenticated;

-- ── STORAGE ───────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'social-media',
  'social-media',
  true,
  52428800,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime']
)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 52428800,
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime'];

DROP POLICY IF EXISTS "Membros leem midia social" ON storage.objects;
CREATE POLICY "Membros leem midia social"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'social-media' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Membros enviam propria midia social" ON storage.objects;
CREATE POLICY "Membros enviam propria midia social"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'social-media'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Membros atualizam propria midia social" ON storage.objects;
CREATE POLICY "Membros atualizam propria midia social"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'social-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Membros removem propria midia social" ON storage.objects;
CREATE POLICY "Membros removem propria midia social"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'social-media'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_diretoria()
    )
  );

-- ── RLS SOCIAL ────────────────────────────────────────────
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_saved_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_story_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_story_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros leem posts sociais" ON public.social_posts;
CREATE POLICY "Membros leem posts sociais"
  ON public.social_posts FOR SELECT
  USING (auth.role() = 'authenticated' AND is_deleted = false);

DROP POLICY IF EXISTS "Membros criam posts sociais" ON public.social_posts;
CREATE POLICY "Membros criam posts sociais"
  ON public.social_posts FOR INSERT
  WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Autores editam posts sociais" ON public.social_posts;
CREATE POLICY "Autores editam posts sociais"
  ON public.social_posts FOR UPDATE
  USING (auth.uid() = author_id OR public.is_diretoria())
  WITH CHECK (auth.uid() = author_id OR public.is_diretoria());

DROP POLICY IF EXISTS "Membros leem midias dos posts" ON public.social_post_media;
CREATE POLICY "Membros leem midias dos posts"
  ON public.social_post_media FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Autores criam midias dos posts" ON public.social_post_media;
CREATE POLICY "Autores criam midias dos posts"
  ON public.social_post_media FOR INSERT
  WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Autores gerenciam midias dos posts" ON public.social_post_media;
CREATE POLICY "Autores gerenciam midias dos posts"
  ON public.social_post_media FOR ALL
  USING (auth.uid() = author_id OR public.is_diretoria())
  WITH CHECK (auth.uid() = author_id OR public.is_diretoria());

DROP POLICY IF EXISTS "Membros leem comentarios sociais" ON public.social_comments;
CREATE POLICY "Membros leem comentarios sociais"
  ON public.social_comments FOR SELECT
  USING (auth.role() = 'authenticated' AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Membros comentam" ON public.social_comments;
CREATE POLICY "Membros comentam"
  ON public.social_comments FOR INSERT
  WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Autores editam comentarios" ON public.social_comments;
CREATE POLICY "Autores editam comentarios"
  ON public.social_comments FOR UPDATE
  USING (auth.uid() = author_id OR public.is_diretoria())
  WITH CHECK (auth.uid() = author_id OR public.is_diretoria());

DROP POLICY IF EXISTS "Membros leem likes sociais" ON public.social_likes;
CREATE POLICY "Membros leem likes sociais"
  ON public.social_likes FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Membros criam proprios likes" ON public.social_likes;
CREATE POLICY "Membros criam proprios likes"
  ON public.social_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Membros removem proprios likes" ON public.social_likes;
CREATE POLICY "Membros removem proprios likes"
  ON public.social_likes FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Membros gerenciam saves" ON public.social_saved_posts;
CREATE POLICY "Membros gerenciam saves"
  ON public.social_saved_posts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Membros leem follows" ON public.social_follows;
CREATE POLICY "Membros leem follows"
  ON public.social_follows FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Membros seguem" ON public.social_follows;
CREATE POLICY "Membros seguem"
  ON public.social_follows FOR INSERT
  WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "Membros deixam de seguir" ON public.social_follows;
CREATE POLICY "Membros deixam de seguir"
  ON public.social_follows FOR DELETE
  USING (auth.uid() = follower_id);

DROP POLICY IF EXISTS "Membros leem stories ativos" ON public.social_stories;
CREATE POLICY "Membros leem stories ativos"
  ON public.social_stories FOR SELECT
  USING (auth.role() = 'authenticated' AND deleted_at IS NULL AND expires_at > now());

DROP POLICY IF EXISTS "Membros criam stories" ON public.social_stories;
CREATE POLICY "Membros criam stories"
  ON public.social_stories FOR INSERT
  WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Autores gerenciam stories" ON public.social_stories;
CREATE POLICY "Autores gerenciam stories"
  ON public.social_stories FOR UPDATE
  USING (auth.uid() = author_id OR public.is_diretoria())
  WITH CHECK (auth.uid() = author_id OR public.is_diretoria());

DROP POLICY IF EXISTS "Membros veem views de stories" ON public.social_story_views;
CREATE POLICY "Membros veem views de stories"
  ON public.social_story_views FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Membros registram view story" ON public.social_story_views;
CREATE POLICY "Membros registram view story"
  ON public.social_story_views FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Membros criam reactions story" ON public.social_story_reactions;
CREATE POLICY "Membros criam reactions story"
  ON public.social_story_reactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Membros atualizam propria reaction story" ON public.social_story_reactions;
CREATE POLICY "Membros atualizam propria reaction story"
  ON public.social_story_reactions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Membros leem reactions story" ON public.social_story_reactions;
CREATE POLICY "Membros leem reactions story"
  ON public.social_story_reactions FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Membros leem mensagens proprias" ON public.social_messages;
CREATE POLICY "Membros leem mensagens proprias"
  ON public.social_messages FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id OR public.is_diretoria());

DROP POLICY IF EXISTS "Membros enviam mensagens" ON public.social_messages;
CREATE POLICY "Membros enviam mensagens"
  ON public.social_messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "Membros atualizam mensagens recebidas" ON public.social_messages;
CREATE POLICY "Membros atualizam mensagens recebidas"
  ON public.social_messages FOR UPDATE
  USING (auth.uid() = recipient_id OR public.is_diretoria())
  WITH CHECK (auth.uid() = recipient_id OR public.is_diretoria());

