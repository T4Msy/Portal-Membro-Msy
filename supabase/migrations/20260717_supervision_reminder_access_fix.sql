-- Lembretes sao uma lista unica da Supervisao, visivel apenas a quem acessa o modulo.
DROP POLICY IF EXISTS "Portal: le lembretes compartilhados" ON public.supervision_reminders;
DROP POLICY IF EXISTS "Supervisao: le lembretes" ON public.supervision_reminders;
CREATE POLICY "Supervisao: le lembretes" ON public.supervision_reminders
  FOR SELECT TO authenticated USING (public.can_access_supervision());
