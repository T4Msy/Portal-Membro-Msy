-- Reuniões privadas: participantes, atas com leitores escolhidos e notificações.

ALTER TABLE public.scheduled_meetings
  ADD COLUMN IF NOT EXISTS meeting_request_id uuid REFERENCES public.meeting_requests(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS scheduled_meetings_request_unique
  ON public.scheduled_meetings(meeting_request_id)
  WHERE meeting_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.scheduled_meeting_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.scheduled_meetings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  added_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_scheduled_meeting_participants_meeting
  ON public.scheduled_meeting_participants(meeting_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_meeting_participants_user
  ON public.scheduled_meeting_participants(user_id);

-- Preserva o acesso dos agendamentos já existentes.
INSERT INTO public.scheduled_meeting_participants (meeting_id, user_id, added_by)
SELECT id, assigned_to, created_by
FROM public.scheduled_meetings
WHERE assigned_to IS NOT NULL
ON CONFLICT (meeting_id, user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.meeting_minute_viewers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  minute_id uuid NOT NULL REFERENCES public.meeting_minutes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  added_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (minute_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_meeting_minute_viewers_minute
  ON public.meeting_minute_viewers(minute_id);
CREATE INDEX IF NOT EXISTS idx_meeting_minute_viewers_user
  ON public.meeting_minute_viewers(user_id);

ALTER TABLE public.scheduled_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_minutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_minute_viewers ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_scheduled_meeting_participant(p_meeting_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.scheduled_meeting_participants
    WHERE meeting_id = p_meeting_id AND user_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "Membros leem reuniões agendadas" ON public.scheduled_meetings;
DROP POLICY IF EXISTS "Diretoria/perm agenda reuniões" ON public.scheduled_meetings;
DROP POLICY IF EXISTS "Diretoria/perm atualiza reuniões" ON public.scheduled_meetings;
DROP POLICY IF EXISTS "Diretoria deleta reuniões agendadas" ON public.scheduled_meetings;
DROP POLICY IF EXISTS "Perm gerencia scheduled meetings all" ON public.scheduled_meetings;
DROP POLICY IF EXISTS "Participantes leem reuniões agendadas" ON public.scheduled_meetings;
DROP POLICY IF EXISTS "Gestão administra reuniões agendadas" ON public.scheduled_meetings;
CREATE POLICY "Participantes leem reuniões agendadas"
  ON public.scheduled_meetings FOR SELECT
  USING (
    public.has_permission('gerenciar_reunioes')
    OR public.is_scheduled_meeting_participant(id)
  );
CREATE POLICY "Gestão administra reuniões agendadas"
  ON public.scheduled_meetings FOR ALL
  USING (public.has_permission('gerenciar_reunioes'))
  WITH CHECK (public.has_permission('gerenciar_reunioes'));

DROP POLICY IF EXISTS "Participantes leem participantes da própria reunião" ON public.scheduled_meeting_participants;
DROP POLICY IF EXISTS "Gestão administra participantes de reuniões" ON public.scheduled_meeting_participants;
CREATE POLICY "Participantes leem participantes da própria reunião"
  ON public.scheduled_meeting_participants FOR SELECT
  USING (
    public.has_permission('gerenciar_reunioes')
    OR public.is_scheduled_meeting_participant(meeting_id)
  );
CREATE POLICY "Gestão administra participantes de reuniões"
  ON public.scheduled_meeting_participants FOR ALL
  USING (public.has_permission('gerenciar_reunioes'))
  WITH CHECK (public.has_permission('gerenciar_reunioes'));

DROP POLICY IF EXISTS "Membros leem atas" ON public.meeting_minutes;
DROP POLICY IF EXISTS "Diretoria/perm cria atas" ON public.meeting_minutes;
DROP POLICY IF EXISTS "Diretoria/perm edita atas" ON public.meeting_minutes;
DROP POLICY IF EXISTS "Diretoria deleta atas" ON public.meeting_minutes;
DROP POLICY IF EXISTS "Leitores escolhidos leem atas" ON public.meeting_minutes;
DROP POLICY IF EXISTS "Gestão administra atas" ON public.meeting_minutes;
CREATE POLICY "Leitores escolhidos leem atas"
  ON public.meeting_minutes FOR SELECT
  USING (
    public.has_permission('gerenciar_reunioes')
    OR EXISTS (
      SELECT 1 FROM public.meeting_minute_viewers v
      WHERE v.minute_id = id AND v.user_id = auth.uid()
    )
  );
CREATE POLICY "Gestão administra atas"
  ON public.meeting_minutes FOR ALL
  USING (public.has_permission('gerenciar_reunioes'))
  WITH CHECK (public.has_permission('gerenciar_reunioes'));

DROP POLICY IF EXISTS "Leitores ou gestão leem permissões de atas" ON public.meeting_minute_viewers;
DROP POLICY IF EXISTS "Gestão administra permissões de atas" ON public.meeting_minute_viewers;
CREATE POLICY "Leitores ou gestão leem permissões de atas"
  ON public.meeting_minute_viewers FOR SELECT
  USING (
    public.has_permission('gerenciar_reunioes')
    OR user_id = auth.uid()
  );
CREATE POLICY "Gestão administra permissões de atas"
  ON public.meeting_minute_viewers FOR ALL
  USING (public.has_permission('gerenciar_reunioes'))
  WITH CHECK (public.has_permission('gerenciar_reunioes'));

-- Notificação interna segura para os membros participantes de uma reunião.
CREATE OR REPLACE FUNCTION public.notify_scheduled_meeting(
  p_meeting_id uuid,
  p_user_ids uuid[],
  p_message text,
  p_type text DEFAULT 'reuniao',
  p_icon text DEFAULT '📅'
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('gerenciar_reunioes') THEN
    RAISE EXCEPTION 'Sem permissão para notificar participantes da reunião.';
  END IF;

  FOREACH v_uid IN ARRAY COALESCE(p_user_ids, ARRAY[]::uuid[])
  LOOP
    CONTINUE WHEN v_uid IS NULL OR v_uid = auth.uid();
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM public.scheduled_meeting_participants
      WHERE meeting_id = p_meeting_id AND user_id = v_uid
    );
    INSERT INTO public.notifications (user_id, actor_id, message, type, icon, link)
    VALUES (v_uid, auth.uid(), p_message, p_type, p_icon, 'reunioes.html');
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_scheduled_meeting(uuid, uuid[], text, text, text) TO authenticated;
