-- ============================================================
-- MSY Portal - Eventos Premium: respostas, justificativas e presenca real
-- Execute no Supabase Dashboard > SQL Editor
-- ============================================================

-- 1) Respostas e presenca real no registro existente.
-- Mantem compatibilidade com status legado:
-- participar, nao_participar, confirmado, ausente, justificado.
ALTER TABLE public.event_presencas
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS justificativa text,
  ADD COLUMN IF NOT EXISTS response_status text,
  ADD COLUMN IF NOT EXISTS response_at timestamptz,
  ADD COLUMN IF NOT EXISTS justificativa_status text,
  ADD COLUMN IF NOT EXISTS justificativa_reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS justificativa_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS justificativa_review_note text,
  ADD COLUMN IF NOT EXISTS attendance_status text,
  ADD COLUMN IF NOT EXISTS attendance_recorded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attendance_recorded_at timestamptz;

UPDATE public.event_presencas
SET user_id = membro_id
WHERE user_id IS NULL
  AND membro_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'event_presencas_response_status_check'
  ) THEN
    ALTER TABLE public.event_presencas
      ADD CONSTRAINT event_presencas_response_status_check
      CHECK (response_status IS NULL OR response_status IN ('participar','nao_participar'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'event_presencas_justificativa_status_check'
  ) THEN
    ALTER TABLE public.event_presencas
      ADD CONSTRAINT event_presencas_justificativa_status_check
      CHECK (justificativa_status IS NULL OR justificativa_status IN ('pendente','aceita','recusada'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'event_presencas_attendance_status_check'
  ) THEN
    ALTER TABLE public.event_presencas
      ADD CONSTRAINT event_presencas_attendance_status_check
      CHECK (attendance_status IS NULL OR attendance_status IN ('presente','ausente'));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'event_presencas_user_event_unique'
  ) THEN
    BEGIN
      ALTER TABLE public.event_presencas
        ADD CONSTRAINT event_presencas_user_event_unique UNIQUE (event_id, user_id);
    EXCEPTION
      WHEN unique_violation THEN
        RAISE NOTICE 'event_presencas tem duplicados em (event_id,user_id); frontend usara fallback sem ON CONFLICT ate a base ser saneada.';
    END;
  END IF;
END$$;

UPDATE public.event_presencas
SET
  response_status = CASE
    WHEN response_status IS NOT NULL THEN response_status
    WHEN status IN ('participar','confirmado') THEN 'participar'
    WHEN status IN ('nao_participar','ausente','justificado') THEN 'nao_participar'
    ELSE response_status
  END,
  response_at = COALESCE(response_at, now()),
  justificativa_status = CASE
    WHEN justificativa_status IS NOT NULL THEN justificativa_status
    WHEN justificativa IS NOT NULL AND btrim(justificativa) <> '' THEN 'pendente'
    ELSE justificativa_status
  END,
  attendance_status = CASE
    WHEN attendance_status IS NOT NULL THEN attendance_status
    WHEN status = 'confirmado' THEN 'presente'
    WHEN status = 'ausente' THEN 'ausente'
    ELSE attendance_status
  END
WHERE response_status IS NULL
   OR response_at IS NULL
   OR justificativa_status IS NULL
   OR attendance_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_event_presencas_response_status
  ON public.event_presencas(response_status);
CREATE INDEX IF NOT EXISTS idx_event_presencas_justificativa_status
  ON public.event_presencas(justificativa_status);
CREATE INDEX IF NOT EXISTS idx_event_presencas_attendance_status
  ON public.event_presencas(attendance_status);

-- 2) Revisao formal de pedidos de cancelamento / mudanca.
ALTER TABLE public.event_cancel_requests
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text;

CREATE INDEX IF NOT EXISTS idx_event_cancel_requests_pending_lookup
  ON public.event_cancel_requests(user_id, event_id, status);

-- 3) RLS ampliado para permissoes granulares novas.
CREATE OR REPLACE FUNCTION public.has_permission(perm text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND tier = 'diretoria'
  )
  OR EXISTS (
    SELECT 1 FROM public.member_permissions
    WHERE user_id = auth.uid()
      AND perm = ANY(permissions)
  );
$$;

ALTER TABLE public.event_presencas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_cancel_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ep_member_select ON public.event_presencas;
CREATE POLICY ep_member_select
ON public.event_presencas
FOR SELECT
USING (
  user_id = auth.uid()
  OR membro_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND tier = 'diretoria')
  OR public.has_permission('gerenciar_eventos')
  OR public.has_permission('gerenciar_presencas')
  OR public.has_permission('registrar_participantes')
  OR public.has_permission('revisar_justificativas_eventos')
  OR public.has_permission('registrar_presencas_eventos')
);

DROP POLICY IF EXISTS ep_member_insert ON public.event_presencas;
CREATE POLICY ep_member_insert
ON public.event_presencas
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  OR public.has_permission('gerenciar_eventos')
  OR public.has_permission('gerenciar_presencas')
  OR public.has_permission('registrar_participantes')
  OR public.has_permission('registrar_presencas_eventos')
);

DROP POLICY IF EXISTS ep_member_update ON public.event_presencas;
CREATE POLICY ep_member_update
ON public.event_presencas
FOR UPDATE
USING (
  user_id = auth.uid()
  OR membro_id = auth.uid()
  OR public.has_permission('gerenciar_eventos')
  OR public.has_permission('gerenciar_presencas')
  OR public.has_permission('registrar_participantes')
  OR public.has_permission('revisar_justificativas_eventos')
  OR public.has_permission('registrar_presencas_eventos')
)
WITH CHECK (
  user_id = auth.uid()
  OR public.has_permission('gerenciar_eventos')
  OR public.has_permission('gerenciar_presencas')
  OR public.has_permission('registrar_participantes')
  OR public.has_permission('revisar_justificativas_eventos')
  OR public.has_permission('registrar_presencas_eventos')
);

DROP POLICY IF EXISTS ep_diretoria_delete ON public.event_presencas;
CREATE POLICY ep_diretoria_delete
ON public.event_presencas
FOR DELETE
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND tier = 'diretoria')
  OR public.has_permission('gerenciar_eventos')
  OR public.has_permission('gerenciar_presencas')
);

DROP POLICY IF EXISTS ecr_member_insert ON public.event_cancel_requests;
CREATE POLICY ecr_member_insert
ON public.event_cancel_requests
FOR INSERT
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS ecr_member_select ON public.event_cancel_requests;
CREATE POLICY ecr_member_select
ON public.event_cancel_requests
FOR SELECT
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND tier = 'diretoria')
  OR public.has_permission('gerenciar_eventos')
  OR public.has_permission('revisar_justificativas_eventos')
);

DROP POLICY IF EXISTS ecr_diretoria_update ON public.event_cancel_requests;
CREATE POLICY ecr_diretoria_update
ON public.event_cancel_requests
FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND tier = 'diretoria')
  OR public.has_permission('gerenciar_eventos')
  OR public.has_permission('revisar_justificativas_eventos')
);

COMMENT ON COLUMN public.event_presencas.response_status IS 'Resposta declarada pelo membro antes do evento.';
COMMENT ON COLUMN public.event_presencas.justificativa_status IS 'Revisao da justificativa: pendente, aceita ou recusada.';
COMMENT ON COLUMN public.event_presencas.attendance_status IS 'Presenca real registrada apos o evento ser concluido.';
