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
  body text NOT NULL DEFAULT 'Sem descricao registrada',
  status text NOT NULL DEFAULT 'nova'
    CHECK (status IN ('nova','analise','planejada','concluida','recusada')),
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Se a tabela ja existia em outro formato, CREATE TABLE IF NOT EXISTS
-- nao adiciona colunas novas. Estes ALTERs tornam a migration reparavel.
ALTER TABLE public.msy_suggestions
  ADD COLUMN IF NOT EXISTS author_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'outro',
  ADD COLUMN IF NOT EXISTS content text,
  ADD COLUMN IF NOT EXISTS body text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'nova',
  ADD COLUMN IF NOT EXISTS admin_note text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.msy_suggestions
SET title = COALESCE(NULLIF(title, ''), 'Sugestao'),
    content = COALESCE(NULLIF(content, ''), NULLIF(body, ''), admin_note, 'Sem descricao registrada'),
    body = COALESCE(NULLIF(body, ''), NULLIF(content, ''), admin_note, 'Sem descricao registrada')
WHERE title IS NULL OR content IS NULL OR body IS NULL;

ALTER TABLE public.msy_suggestions
  ALTER COLUMN title SET NOT NULL,
  ALTER COLUMN content SET NOT NULL,
  ALTER COLUMN body SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'msy_suggestions_category_check'
      AND conrelid = 'public.msy_suggestions'::regclass
  ) THEN
    ALTER TABLE public.msy_suggestions
      ADD CONSTRAINT msy_suggestions_category_check
      CHECK (category IN ('melhoria','bug','evento','interface','outro'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'msy_suggestions_status_check'
      AND conrelid = 'public.msy_suggestions'::regclass
  ) THEN
    ALTER TABLE public.msy_suggestions
      ADD CONSTRAINT msy_suggestions_status_check
      CHECK (status IN ('nova','analise','planejada','concluida','recusada'));
  END IF;
END $$;

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

-- Atualiza o schema cache do PostgREST/Supabase imediatamente apos a migration.
NOTIFY pgrst, 'reload schema';
