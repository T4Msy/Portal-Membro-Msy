-- Estados de aprovacao para acoes sugeridas pelo Radar Diario.
ALTER TABLE public.supervision_reminders
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE public.supervision_reminders
  DROP CONSTRAINT IF EXISTS supervision_reminders_approval_status_check;

ALTER TABLE public.supervision_reminders
  ADD CONSTRAINT supervision_reminders_approval_status_check
  CHECK (approval_status IN ('pending_approval', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_supervision_reminders_approval
  ON public.supervision_reminders(approval_status, status, due_at);

COMMENT ON COLUMN public.supervision_reminders.approval_status IS 'Estado da aprovacao da acao sugerida pela Supervisao.';
