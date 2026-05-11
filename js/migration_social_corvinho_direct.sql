-- ============================================================
-- MSY PORTAL — MIGRATION SOCIAL DIRECT V1
-- Base conversacional do Direct com streak interno.
-- Execute no Supabase Dashboard > SQL Editor.
-- ============================================================

-- ── DIRECT HELPERS ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.direct_dm_key(user_a uuid, user_b uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN user_a IS NULL OR user_b IS NULL OR user_a = user_b THEN NULL
    WHEN user_a::text < user_b::text THEN user_a::text || ':' || user_b::text
    ELSE user_b::text || ':' || user_a::text
  END;
$$;

-- ── DIRECT TABLES ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.direct_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'dm' CHECK (kind IN ('dm')),
  dm_key text UNIQUE,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_direct_conversations_last_message
  ON public.direct_conversations(last_message_at DESC NULLS LAST, created_at DESC);

CREATE TABLE IF NOT EXISTS public.direct_participants (
  conversation_id uuid NOT NULL REFERENCES public.direct_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz,
  last_notified_at timestamptz,
  is_archived boolean NOT NULL DEFAULT false,
  is_muted boolean NOT NULL DEFAULT false,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_direct_participants_user
  ON public.direct_participants(user_id, joined_at DESC);

CREATE INDEX IF NOT EXISTS idx_direct_participants_conversation
  ON public.direct_participants(conversation_id, joined_at ASC);

CREATE TABLE IF NOT EXISTS public.direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.direct_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text,
  attachment jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    COALESCE(NULLIF(btrim(body), ''), '') <> ''
    OR attachment <> '{}'::jsonb
  )
);

CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation
  ON public.direct_messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_direct_messages_sender
  ON public.direct_messages(sender_id, created_at DESC);

-- ── DIRECT FUNCTIONS ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.direct_is_participant(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.direct_participants dp
    WHERE dp.conversation_id = p_conversation_id
      AND dp.user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.direct_is_participant(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.ensure_direct_dm_conversation(p_other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_dm_key text;
  v_conversation_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  IF p_other_user_id IS NULL OR p_other_user_id = v_user_id THEN
    RAISE EXCEPTION 'Conversa inválida.';
  END IF;

  v_dm_key := public.direct_dm_key(v_user_id, p_other_user_id);

  SELECT id
  INTO v_conversation_id
  FROM public.direct_conversations
  WHERE dm_key = v_dm_key
  LIMIT 1;

  IF v_conversation_id IS NULL THEN
    INSERT INTO public.direct_conversations (kind, dm_key, created_by, last_message_at)
    VALUES ('dm', v_dm_key, v_user_id, now())
    RETURNING id INTO v_conversation_id;
  ELSE
    UPDATE public.direct_conversations
    SET updated_at = now(),
        last_message_at = COALESCE(last_message_at, now())
    WHERE id = v_conversation_id;
  END IF;

  INSERT INTO public.direct_participants (conversation_id, user_id)
  VALUES
    (v_conversation_id, v_user_id),
    (v_conversation_id, p_other_user_id)
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  RETURN v_conversation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_direct_dm_conversation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.touch_direct_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.direct_conversations
  SET last_message_at = NEW.created_at,
      updated_at = now()
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_direct_streak(p_conversation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participants uuid[];
  v_days int := 0;
  v_active boolean := false;
  v_level text := 'apagado';
  v_cursor date := NULL;
  v_day date;
  v_day_participants uuid[];
BEGIN
  SELECT array_agg(user_id ORDER BY user_id)
  INTO v_participants
  FROM public.direct_participants
  WHERE conversation_id = p_conversation_id;

  IF v_participants IS NULL OR array_length(v_participants, 1) < 2 THEN
    UPDATE public.direct_conversations
    SET metadata = jsonb_set(metadata, '{direct_streak}', jsonb_build_object('days', 0, 'active', false, 'level', 'apagado', 'updated_at', NULL), true),
        updated_at = now()
    WHERE id = p_conversation_id;
    RETURN jsonb_build_object('days', 0, 'active', false, 'level', 'apagado', 'updated_at', NULL);
  END IF;

  FOR v_day IN
    SELECT DISTINCT (dm.created_at AT TIME ZONE 'UTC')::date
    FROM public.direct_messages dm
    WHERE dm.conversation_id = p_conversation_id
      AND dm.deleted_at IS NULL
    ORDER BY 1 DESC
  LOOP
    SELECT array_agg(DISTINCT dm.sender_id)
    INTO v_day_participants
    FROM public.direct_messages dm
    WHERE dm.conversation_id = p_conversation_id
      AND dm.deleted_at IS NULL
      AND (dm.created_at AT TIME ZONE 'UTC')::date = v_day
      AND dm.sender_id = ANY (v_participants);

    IF v_day_participants IS NULL OR array_length(v_day_participants, 1) < 2 THEN
      EXIT;
    END IF;

    IF v_cursor IS NOT NULL AND (v_cursor - v_day) <> 1 THEN
      EXIT;
    END IF;

    v_days := v_days + 1;
    v_cursor := v_day;
  END LOOP;

  v_active := v_days >= 2;
  v_level := CASE
    WHEN NOT v_active THEN 'apagado'
    WHEN v_days >= 30 THEN 'lendario'
    WHEN v_days >= 15 THEN 'forte'
    WHEN v_days >= 7 THEN 'medio'
    WHEN v_days >= 3 THEN 'pequeno'
    ELSE 'nascimento'
  END;

  UPDATE public.direct_conversations
  SET metadata = jsonb_set(metadata, '{direct_streak}', jsonb_build_object('days', v_days, 'active', v_active, 'level', v_level, 'updated_at', now()), true),
      updated_at = now()
  WHERE id = p_conversation_id;

  RETURN jsonb_build_object('days', v_days, 'active', v_active, 'level', v_level, 'updated_at', now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_direct_streak(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_direct_message_participants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_preview text;
BEGIN
  v_preview := LEFT(COALESCE(NULLIF(btrim(NEW.body), ''), 'Nova mensagem'), 120);

  PERFORM public.notify_social(
    dp.user_id,
    NEW.sender_id,
    v_preview,
    'info',
    '✉️',
    'direct_conversation',
    NEW.conversation_id,
    'feed.html?direct=' || NEW.conversation_id,
    NULL,
    jsonb_build_object('conversation_id', NEW.conversation_id, 'message_id', NEW.id, 'event', 'direct_message')
  )
  FROM public.direct_participants dp
  WHERE dp.conversation_id = NEW.conversation_id
    AND dp.user_id <> NEW.sender_id
    AND dp.is_muted = false;

  UPDATE public.direct_participants
  SET last_notified_at = now()
  WHERE conversation_id = NEW.conversation_id
    AND user_id <> NEW.sender_id
    AND is_muted = false;

  PERFORM public.recalculate_direct_streak(NEW.conversation_id);

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_direct_streak(p_conversation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participants uuid[];
  v_days int := 0;
  v_active boolean := false;
  v_level text := 'apagado';
  v_cursor date := NULL;
  v_day date;
  v_day_participants uuid[];
BEGIN
  SELECT array_agg(user_id ORDER BY user_id)
  INTO v_participants
  FROM public.direct_participants
  WHERE conversation_id = p_conversation_id;

  IF v_participants IS NULL OR array_length(v_participants, 1) < 2 THEN
    UPDATE public.direct_conversations
    SET metadata = jsonb_set(metadata, '{direct_streak}', jsonb_build_object('days', 0, 'active', false, 'level', 'apagado', 'updated_at', NULL), true),
        updated_at = now()
    WHERE id = p_conversation_id;
    RETURN jsonb_build_object('days', 0, 'active', false, 'level', 'apagado', 'updated_at', NULL);
  END IF;

  FOR v_day IN
    SELECT DISTINCT (dm.created_at AT TIME ZONE 'UTC')::date
    FROM public.direct_messages dm
    WHERE dm.conversation_id = p_conversation_id
      AND dm.deleted_at IS NULL
    ORDER BY 1 DESC
  LOOP
    SELECT array_agg(DISTINCT dm.sender_id)
    INTO v_day_participants
    FROM public.direct_messages dm
    WHERE dm.conversation_id = p_conversation_id
      AND dm.deleted_at IS NULL
      AND (dm.created_at AT TIME ZONE 'UTC')::date = v_day
      AND dm.sender_id = ANY (v_participants);

    IF v_day_participants IS NULL OR array_length(v_day_participants, 1) < 2 THEN
      EXIT;
    END IF;

    IF v_cursor IS NOT NULL AND (v_cursor - v_day) <> 1 THEN
      EXIT;
    END IF;

    v_days := v_days + 1;
    v_cursor := v_day;
  END LOOP;

  v_active := v_days >= 2;
  v_level := CASE
    WHEN NOT v_active THEN 'apagado'
    WHEN v_days >= 30 THEN 'lendario'
    WHEN v_days >= 15 THEN 'forte'
    WHEN v_days >= 7 THEN 'medio'
    WHEN v_days >= 3 THEN 'pequeno'
    ELSE 'nascimento'
  END;

  UPDATE public.direct_conversations
  SET metadata = jsonb_set(metadata, '{direct_streak}', jsonb_build_object('days', v_days, 'active', v_active, 'level', v_level, 'updated_at', now()), true),
      updated_at = now()
  WHERE id = p_conversation_id;

  RETURN jsonb_build_object('days', v_days, 'active', v_active, 'level', v_level, 'updated_at', now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_direct_streak(uuid) TO authenticated;

DROP TRIGGER IF EXISTS trg_direct_messages_touch_conversation ON public.direct_messages;
CREATE TRIGGER trg_direct_messages_touch_conversation
  AFTER INSERT ON public.direct_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_direct_conversation();

DROP TRIGGER IF EXISTS trg_direct_messages_notify_participants ON public.direct_messages;
CREATE TRIGGER trg_direct_messages_notify_participants
  AFTER INSERT ON public.direct_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_direct_message_participants();

CREATE OR REPLACE FUNCTION public.recalculate_direct_streak_on_message_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalculate_direct_streak(COALESCE(NEW.conversation_id, OLD.conversation_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_direct_messages_recalc_streak ON public.direct_messages;
CREATE TRIGGER trg_direct_messages_recalc_streak
  AFTER INSERT OR UPDATE OF deleted_at OR DELETE ON public.direct_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.recalculate_direct_streak_on_message_change();

-- Recalcular streak inicial de conversas legadas/importadas.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.direct_conversations LOOP
    PERFORM public.recalculate_direct_streak(r.id);
  END LOOP;
END;
$$;

-- ── MIGRAÇÃO DO LEGADO social_messages ─────────────────────
INSERT INTO public.direct_conversations (kind, dm_key, created_by, created_at, last_message_at)
SELECT DISTINCT ON (public.direct_dm_key(sm.sender_id, sm.recipient_id))
  'dm',
  public.direct_dm_key(sm.sender_id, sm.recipient_id),
  sm.sender_id,
  sm.created_at,
  sm.created_at
FROM public.social_messages sm
WHERE public.direct_dm_key(sm.sender_id, sm.recipient_id) IS NOT NULL
ORDER BY public.direct_dm_key(sm.sender_id, sm.recipient_id), sm.created_at ASC
ON CONFLICT (dm_key) DO NOTHING;

INSERT INTO public.direct_participants (conversation_id, user_id, joined_at)
SELECT
  dc.id,
  participants.user_id,
  participants.joined_at
FROM (
  SELECT public.direct_dm_key(sender_id, recipient_id) AS dm_key, sender_id AS user_id, MIN(created_at) AS joined_at
  FROM public.social_messages
  GROUP BY 1, 2
  UNION
  SELECT public.direct_dm_key(sender_id, recipient_id) AS dm_key, recipient_id AS user_id, MIN(created_at) AS joined_at
  FROM public.social_messages
  GROUP BY 1, 2
) participants
JOIN public.direct_conversations dc
  ON dc.dm_key = participants.dm_key
WHERE participants.dm_key IS NOT NULL
ON CONFLICT (conversation_id, user_id) DO NOTHING;

INSERT INTO public.direct_messages (id, conversation_id, sender_id, body, attachment, metadata, created_at)
SELECT
  sm.id,
  dc.id,
  sm.sender_id,
  NULLIF(btrim(sm.body), ''),
  CASE
    WHEN sm.post_id IS NOT NULL OR sm.story_id IS NOT NULL THEN jsonb_strip_nulls(jsonb_build_object(
      'kind', CASE
        WHEN sm.post_id IS NOT NULL THEN 'post_share'
        WHEN sm.story_id IS NOT NULL THEN 'story_share'
        ELSE NULL
      END,
      'post_id', sm.post_id,
      'story_id', sm.story_id
    ))
    ELSE '{}'::jsonb
  END,
  jsonb_strip_nulls(jsonb_build_object(
    'legacy_social_message_id', sm.id,
    'legacy_read_at', sm.read_at
  )),
  sm.created_at
FROM public.social_messages sm
JOIN public.direct_conversations dc
  ON dc.dm_key = public.direct_dm_key(sm.sender_id, sm.recipient_id)
WHERE COALESCE(NULLIF(btrim(sm.body), ''), '') <> ''
   OR sm.post_id IS NOT NULL
   OR sm.story_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

UPDATE public.direct_conversations dc
SET last_message_at = latest.last_message_at,
    updated_at = GREATEST(dc.updated_at, latest.last_message_at)
FROM (
  SELECT conversation_id, MAX(created_at) AS last_message_at
  FROM public.direct_messages
  WHERE deleted_at IS NULL
  GROUP BY conversation_id
) latest
WHERE latest.conversation_id = dc.id;

UPDATE public.direct_participants dp
SET last_read_at = reads.last_read_at
FROM (
  SELECT
    dc.id AS conversation_id,
    sm.recipient_id AS user_id,
    MAX(sm.read_at) AS last_read_at
  FROM public.social_messages sm
  JOIN public.direct_conversations dc
    ON dc.dm_key = public.direct_dm_key(sm.sender_id, sm.recipient_id)
  WHERE sm.read_at IS NOT NULL
  GROUP BY dc.id, sm.recipient_id
) reads
WHERE reads.conversation_id = dp.conversation_id
  AND reads.user_id = dp.user_id;

-- ── DIRECT RLS ─────────────────────────────────────────────
ALTER TABLE public.direct_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participantes leem conversas direct" ON public.direct_conversations;
CREATE POLICY "Participantes leem conversas direct"
  ON public.direct_conversations FOR SELECT
  USING (public.direct_is_participant(id) OR public.is_diretoria());

DROP POLICY IF EXISTS "Membros criam conversas direct" ON public.direct_conversations;
CREATE POLICY "Membros criam conversas direct"
  ON public.direct_conversations FOR INSERT
  WITH CHECK (auth.uid() = created_by OR public.is_diretoria());

DROP POLICY IF EXISTS "Diretoria atualiza conversas direct" ON public.direct_conversations;
CREATE POLICY "Diretoria atualiza conversas direct"
  ON public.direct_conversations FOR UPDATE
  USING (public.is_diretoria())
  WITH CHECK (public.is_diretoria());

DROP POLICY IF EXISTS "Participantes leem participantes direct" ON public.direct_participants;
CREATE POLICY "Participantes leem participantes direct"
  ON public.direct_participants FOR SELECT
  USING (public.direct_is_participant(conversation_id) OR public.is_diretoria());

DROP POLICY IF EXISTS "Membros gerenciam propria participacao direct" ON public.direct_participants;
CREATE POLICY "Membros gerenciam propria participacao direct"
  ON public.direct_participants FOR UPDATE
  USING (auth.uid() = user_id OR public.is_diretoria())
  WITH CHECK (auth.uid() = user_id OR public.is_diretoria());

DROP POLICY IF EXISTS "Diretoria insere participantes direct" ON public.direct_participants;
CREATE POLICY "Diretoria insere participantes direct"
  ON public.direct_participants FOR INSERT
  WITH CHECK (public.is_diretoria());

DROP POLICY IF EXISTS "Participantes leem mensagens direct" ON public.direct_messages;
CREATE POLICY "Participantes leem mensagens direct"
  ON public.direct_messages FOR SELECT
  USING (public.direct_is_participant(conversation_id) OR public.is_diretoria());

DROP POLICY IF EXISTS "Participantes enviam mensagens direct" ON public.direct_messages;
CREATE POLICY "Participantes enviam mensagens direct"
  ON public.direct_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND (public.direct_is_participant(conversation_id) OR public.is_diretoria())
  );

DROP POLICY IF EXISTS "Autores editam mensagens direct" ON public.direct_messages;
CREATE POLICY "Autores editam mensagens direct"
  ON public.direct_messages FOR UPDATE
  USING (auth.uid() = sender_id OR public.is_diretoria())
  WITH CHECK (auth.uid() = sender_id OR public.is_diretoria());
