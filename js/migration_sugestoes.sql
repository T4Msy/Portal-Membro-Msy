-- ============================================================
-- MSY PORTAL - Migration: Sistema de Sugestões
-- Execute no Supabase Dashboard > SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.msy_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'outro'
    CHECK (category IN ('melhoria','bug','evento','interface','outro')),
  content text NOT NULL,
  status text NOT NULL DEFAULT 'nova'
    CHECK (status IN ('nova','analise','planejada','concluida','recusada')),
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_msy_suggestions_author
  ON public.msy_suggestions(author_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_msy_suggestions_status
  ON public.msy_suggestions(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_msy_suggestions_category
  ON public.msy_suggestions(category, created_at DESC);

ALTER TABLE public.msy_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros criam sugestoes" ON public.msy_suggestions;
CREATE POLICY "Membros criam sugestoes"
  ON public.msy_suggestions FOR INSERT
  WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Membros leem proprias sugestoes" ON public.msy_suggestions;
CREATE POLICY "Membros leem proprias sugestoes"
  ON public.msy_suggestions FOR SELECT
  USING (auth.uid() = author_id OR public.is_diretoria());

DROP POLICY IF EXISTS "Diretoria gerencia sugestoes" ON public.msy_suggestions;
CREATE POLICY "Diretoria gerencia sugestoes"
  ON public.msy_suggestions FOR UPDATE
  USING (public.is_diretoria())
  WITH CHECK (public.is_diretoria());

DROP POLICY IF EXISTS "Diretoria remove sugestoes" ON public.msy_suggestions;
CREATE POLICY "Diretoria remove sugestoes"
  ON public.msy_suggestions FOR DELETE
  USING (public.is_diretoria());

COMMENT ON TABLE public.msy_suggestions IS
  'Ideias e melhorias enviadas pelos membros para análise da Diretoria.';
