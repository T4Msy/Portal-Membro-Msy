-- ============================================================
-- MSY PORTAL — Jornal da Masayoshi
-- Central editorial multimidia: videos, artigos, galerias,
-- tirinhas, especiais, comentarios e storage proprio.
-- Execute no Supabase Dashboard > SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.jornal_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  title text NOT NULL,
  subtitle text,
  summary text,
  post_type text NOT NULL DEFAULT 'article'
    CHECK (post_type IN ('video','article','gallery','tirinha','special')),
  section text NOT NULL DEFAULT 'principal'
    CHECK (section IN ('principal','videos','tirinha','especiais','arquivo')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published','archived')),
  content_blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  cover_url text,
  cover_storage_path text,
  video_url text,
  video_storage_path text,
  comments_enabled boolean NOT NULL DEFAULT true,
  is_featured boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jornal_posts_status_published
  ON public.jornal_posts(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_jornal_posts_section
  ON public.jornal_posts(section, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_jornal_posts_featured
  ON public.jornal_posts(is_featured, published_at DESC);

CREATE TABLE IF NOT EXISTS public.jornal_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.jornal_posts(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  media_type text NOT NULL CHECK (media_type IN ('image','video','thumbnail')),
  url text NOT NULL,
  storage_path text,
  position integer NOT NULL DEFAULT 0,
  caption text,
  alt_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jornal_media_post
  ON public.jornal_media(post_id, position);

CREATE TABLE IF NOT EXISTS public.jornal_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.jornal_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jornal_comments_post
  ON public.jornal_comments(post_id, created_at);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'jornal-media',
  'jornal-media',
  true,
  52428800,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime']
)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 52428800,
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime'];

ALTER TABLE public.jornal_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jornal_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jornal_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros leem Jornal publicado" ON public.jornal_posts;
CREATE POLICY "Membros leem Jornal publicado"
  ON public.jornal_posts FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      status IN ('published','archived')
      OR public.is_diretoria()
      OR public.has_permission('gerenciar_jornal')
    )
  );

DROP POLICY IF EXISTS "Editores criam Jornal" ON public.jornal_posts;
CREATE POLICY "Editores criam Jornal"
  ON public.jornal_posts FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND (public.is_diretoria() OR public.has_permission('gerenciar_jornal'))
  );

DROP POLICY IF EXISTS "Editores atualizam Jornal" ON public.jornal_posts;
CREATE POLICY "Editores atualizam Jornal"
  ON public.jornal_posts FOR UPDATE
  USING (public.is_diretoria() OR public.has_permission('gerenciar_jornal'))
  WITH CHECK (public.is_diretoria() OR public.has_permission('gerenciar_jornal'));

DROP POLICY IF EXISTS "Editores deletam Jornal" ON public.jornal_posts;
CREATE POLICY "Editores deletam Jornal"
  ON public.jornal_posts FOR DELETE
  USING (public.is_diretoria() OR public.has_permission('gerenciar_jornal'));

DROP POLICY IF EXISTS "Membros leem midias do Jornal" ON public.jornal_media;
CREATE POLICY "Membros leem midias do Jornal"
  ON public.jornal_media FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.jornal_posts p
      WHERE p.id = jornal_media.post_id
        AND (
          p.status IN ('published','archived')
          OR public.is_diretoria()
          OR public.has_permission('gerenciar_jornal')
        )
    )
  );

DROP POLICY IF EXISTS "Editores gerenciam midias do Jornal" ON public.jornal_media;
CREATE POLICY "Editores gerenciam midias do Jornal"
  ON public.jornal_media FOR ALL
  USING (public.is_diretoria() OR public.has_permission('gerenciar_jornal'))
  WITH CHECK (public.is_diretoria() OR public.has_permission('gerenciar_jornal'));

DROP POLICY IF EXISTS "Membros leem comentarios do Jornal" ON public.jornal_comments;
CREATE POLICY "Membros leem comentarios do Jornal"
  ON public.jornal_comments FOR SELECT
  USING (
    deleted_at IS NULL
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.jornal_posts p
      WHERE p.id = jornal_comments.post_id
        AND (
          p.status IN ('published','archived')
          OR public.is_diretoria()
          OR public.has_permission('gerenciar_jornal')
        )
    )
  );

DROP POLICY IF EXISTS "Membros comentam no Jornal" ON public.jornal_comments;
CREATE POLICY "Membros comentam no Jornal"
  ON public.jornal_comments FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM public.jornal_posts p
      WHERE p.id = jornal_comments.post_id
        AND p.status = 'published'
        AND p.comments_enabled = true
    )
  );

DROP POLICY IF EXISTS "Autores removem comentarios do Jornal" ON public.jornal_comments;
CREATE POLICY "Autores removem comentarios do Jornal"
  ON public.jornal_comments FOR UPDATE
  USING (
    auth.uid() = author_id
    OR public.is_diretoria()
    OR public.has_permission('gerenciar_jornal')
  )
  WITH CHECK (
    auth.uid() = author_id
    OR public.is_diretoria()
    OR public.has_permission('gerenciar_jornal')
  );

DROP POLICY IF EXISTS "Membros leem storage do Jornal" ON storage.objects;
CREATE POLICY "Membros leem storage do Jornal"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'jornal-media' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Editores enviam storage do Jornal" ON storage.objects;
CREATE POLICY "Editores enviam storage do Jornal"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'jornal-media'
    AND auth.role() = 'authenticated'
    AND (public.is_diretoria() OR public.has_permission('gerenciar_jornal'))
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Editores atualizam storage do Jornal" ON storage.objects;
CREATE POLICY "Editores atualizam storage do Jornal"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'jornal-media'
    AND (public.is_diretoria() OR public.has_permission('gerenciar_jornal'))
  );

DROP POLICY IF EXISTS "Editores removem storage do Jornal" ON storage.objects;
CREATE POLICY "Editores removem storage do Jornal"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'jornal-media'
    AND (public.is_diretoria() OR public.has_permission('gerenciar_jornal'))
  );

COMMENT ON TABLE public.jornal_posts IS
  'Conteudos editoriais do Jornal da Masayoshi.';
COMMENT ON TABLE public.jornal_media IS
  'Midias vinculadas aos conteudos do Jornal da Masayoshi.';
COMMENT ON TABLE public.jornal_comments IS
  'Comentarios dos membros nos conteudos publicados do Jornal da Masayoshi.';
