-- Permite que a gestão de reuniões exclua solicitações de reunião.
-- Reuniões criadas a partir da solicitação continuam existindo (meeting_request_id vira NULL).

DROP POLICY IF EXISTS "Gestão exclui solicitações de reunião" ON public.meeting_requests;
CREATE POLICY "Gestão exclui solicitações de reunião"
  ON public.meeting_requests FOR DELETE
  USING (public.has_permission('gerenciar_reunioes'));

-- Ata vinculada também às reuniões do formato antigo (tabela meetings).
ALTER TABLE public.meeting_minutes
  ADD COLUMN IF NOT EXISTS meeting_id uuid
    REFERENCES public.meetings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_meeting_minutes_meeting
  ON public.meeting_minutes(meeting_id);
