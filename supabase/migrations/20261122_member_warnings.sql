-- ============================================================
-- Advertências dos membros, aplicadas pela Diretoria
-- (bloco "Advertências" no Progresso e no perfil).
--
-- Cada advertência tem só o motivo, a data e quem aplicou.
-- O portal conta as dos últimos 3 meses: com 3 ou mais mostra
-- "Sujeito a suspensão". As mais antigas ficam no histórico.
--
-- Quem lê:      o próprio membro (só as dele) e a Diretoria (todas).
-- Quem escreve: só a Diretoria.
-- Aplicar no Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.member_warnings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  motivo      text NOT NULL CHECK (char_length(btrim(motivo)) BETWEEN 3 AND 1000),
  applied_at  date NOT NULL DEFAULT current_date,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS member_warnings_user_idx
  ON public.member_warnings (user_id, applied_at DESC);

ALTER TABLE public.member_warnings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "member_warnings_select" ON public.member_warnings;
DROP POLICY IF EXISTS "member_warnings_insert" ON public.member_warnings;
DROP POLICY IF EXISTS "member_warnings_update" ON public.member_warnings;
DROP POLICY IF EXISTS "member_warnings_delete" ON public.member_warnings;

CREATE POLICY "member_warnings_select" ON public.member_warnings FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_diretoria());

CREATE POLICY "member_warnings_insert" ON public.member_warnings FOR INSERT
TO authenticated
WITH CHECK (public.is_diretoria());

CREATE POLICY "member_warnings_update" ON public.member_warnings FOR UPDATE
TO authenticated
USING (public.is_diretoria())
WITH CHECK (public.is_diretoria());

CREATE POLICY "member_warnings_delete" ON public.member_warnings FOR DELETE
TO authenticated
USING (public.is_diretoria());

-- created_by e updated_at automáticos
CREATE OR REPLACE FUNCTION public.member_warnings_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS member_warnings_touch ON public.member_warnings;
CREATE TRIGGER member_warnings_touch
  BEFORE INSERT OR UPDATE ON public.member_warnings
  FOR EACH ROW EXECUTE FUNCTION public.member_warnings_touch();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_warnings TO authenticated;

NOTIFY pgrst, 'reload schema';
