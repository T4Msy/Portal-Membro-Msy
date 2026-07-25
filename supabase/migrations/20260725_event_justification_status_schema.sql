-- Estado de revisao das justificativas de ausencia.
-- Seguro para executar em bases que ja possuem parte desta estrutura.

ALTER TABLE public.event_presencas
  ADD COLUMN IF NOT EXISTS justificativa_status text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'event_presencas_justificativa_status_check'
  ) THEN
    ALTER TABLE public.event_presencas
      ADD CONSTRAINT event_presencas_justificativa_status_check
      CHECK (justificativa_status IS NULL OR justificativa_status IN ('pendente', 'aceita', 'recusada'));
  END IF;
END;
$$;

UPDATE public.event_presencas
SET justificativa_status = 'pendente'
WHERE NULLIF(btrim(justificativa), '') IS NOT NULL
  AND justificativa_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_event_presencas_justificativa_status
  ON public.event_presencas(justificativa_status);
