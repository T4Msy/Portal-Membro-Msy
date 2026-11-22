-- ============================================================
-- Progresso do membro: avaliação semanal do desempenho no cargo,
-- dada pela Diretoria (página "Progresso" e bloco no perfil).
--
-- Uma linha por membro por semana (week_start = domingo da semana).
-- Três notas de 0 a 10, com pesos fixos calculados no portal:
--   Autonomia e Inovação 20% · Atividades 40% · Presença 40%
--
-- Quem lê:      o próprio membro (só as dele) e a Diretoria (todas).
-- Quem escreve: só a Diretoria.
-- Aplicar no Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.member_progress_reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  week_start  date NOT NULL CHECK (extract(dow FROM week_start) = 0),
  autonomia   numeric(3,1) NOT NULL CHECK (autonomia  BETWEEN 0 AND 10),
  atividades  numeric(3,1) NOT NULL CHECK (atividades BETWEEN 0 AND 10),
  presenca    numeric(3,1) NOT NULL CHECK (presenca   BETWEEN 0 AND 10),
  comentario  text CHECK (comentario IS NULL OR char_length(comentario) <= 1000),
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start)
);

CREATE INDEX IF NOT EXISTS member_progress_reviews_week_idx
  ON public.member_progress_reviews (week_start DESC);

ALTER TABLE public.member_progress_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "member_progress_reviews_select" ON public.member_progress_reviews;
DROP POLICY IF EXISTS "member_progress_reviews_insert" ON public.member_progress_reviews;
DROP POLICY IF EXISTS "member_progress_reviews_update" ON public.member_progress_reviews;
DROP POLICY IF EXISTS "member_progress_reviews_delete" ON public.member_progress_reviews;

CREATE POLICY "member_progress_reviews_select" ON public.member_progress_reviews FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_diretoria());

CREATE POLICY "member_progress_reviews_insert" ON public.member_progress_reviews FOR INSERT
TO authenticated
WITH CHECK (public.is_diretoria());

CREATE POLICY "member_progress_reviews_update" ON public.member_progress_reviews FOR UPDATE
TO authenticated
USING (public.is_diretoria())
WITH CHECK (public.is_diretoria());

CREATE POLICY "member_progress_reviews_delete" ON public.member_progress_reviews FOR DELETE
TO authenticated
USING (public.is_diretoria());

-- updated_at / updated_by automáticos
CREATE OR REPLACE FUNCTION public.member_progress_reviews_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS member_progress_reviews_touch ON public.member_progress_reviews;
CREATE TRIGGER member_progress_reviews_touch
  BEFORE INSERT OR UPDATE ON public.member_progress_reviews
  FOR EACH ROW EXECUTE FUNCTION public.member_progress_reviews_touch();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_progress_reviews TO authenticated;
