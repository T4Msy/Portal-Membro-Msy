-- ============================================================
-- MSY PORTAL — SOCIAL V2 FEATURES
-- Direct edit/delete states, stories RPC/media metadata,
-- feed_atividade fields/policies, and upload diagnostics support.
-- Execute no Supabase Dashboard > SQL Editor.
-- ============================================================

-- ── DIRECT: ESTADO POR USUÁRIO ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.direct_message_user_state (
  message_id uuid NOT NULL REFERENCES public.direct_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  hidden_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_direct_message_user_state_user_hidden
  ON public.direct_message_user_state(user_id, hidden_at DESC);

ALTER TABLE public.direct_message_user_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios leem proprio estado de mensagem direct" ON public.direct_message_user_state;
CREATE POLICY "Usuarios leem proprio estado de mensagem direct"
  ON public.direct_message_user_state FOR SELECT
  USING (auth.uid() = user_id OR public.is_diretoria());

DROP POLICY IF EXISTS "Usuarios gerenciam proprio estado de mensagem direct" ON public.direct_message_user_state;
CREATE POLICY "Usuarios gerenciam proprio estado de mensagem direct"
  ON public.direct_message_user_state FOR ALL
  USING (auth.uid() = user_id OR public.is_diretoria())
  WITH CHECK (auth.uid() = user_id OR public.is_diretoria());

CREATE OR REPLACE FUNCTION public.touch_direct_message_user_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_direct_message_user_state_touch ON public.direct_message_user_state;
CREATE TRIGGER trg_direct_message_user_state_touch
  BEFORE UPDATE ON public.direct_message_user_state
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_direct_message_user_state();

CREATE OR REPLACE FUNCTION public.update_direct_message(
  p_message_id uuid,
  p_body text
) RETURNS public.direct_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message public.direct_messages%ROWTYPE;
  v_clean_body text;
BEGIN
  v_clean_body := NULLIF(btrim(COALESCE(p_body, '')), '');

  SELECT *
    INTO v_message
  FROM public.direct_messages
  WHERE id = p_message_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mensagem não encontrada.';
  END IF;

  IF auth.uid() IS NULL OR (auth.uid() <> v_message.sender_id AND NOT public.is_diretoria()) THEN
    RAISE EXCEPTION 'Sem permissão para editar esta mensagem.';
  END IF;

  IF v_message.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Mensagem apagada não pode ser editada.';
  END IF;

  IF v_clean_body IS NULL THEN
    RAISE EXCEPTION 'Mensagem vazia.';
  END IF;

  UPDATE public.direct_messages
     SET body = v_clean_body,
         edited_at = now(),
         metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{event}', '"message_edited"'::jsonb, true)
   WHERE id = p_message_id
   RETURNING * INTO v_message;

  RETURN v_message;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_direct_message_for_me(
  p_message_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message public.direct_messages%ROWTYPE;
BEGIN
  SELECT *
    INTO v_message
  FROM public.direct_messages
  WHERE id = p_message_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mensagem não encontrada.';
  END IF;

  IF auth.uid() IS NULL OR NOT public.direct_is_participant(v_message.conversation_id) THEN
    RAISE EXCEPTION 'Sem permissão para ocultar esta mensagem.';
  END IF;

  INSERT INTO public.direct_message_user_state (message_id, user_id, hidden_at)
  VALUES (p_message_id, auth.uid(), now())
  ON CONFLICT (message_id, user_id)
  DO UPDATE SET hidden_at = EXCLUDED.hidden_at;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_direct_message_for_all(
  p_message_id uuid
) RETURNS public.direct_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message public.direct_messages%ROWTYPE;
BEGIN
  SELECT *
    INTO v_message
  FROM public.direct_messages
  WHERE id = p_message_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mensagem não encontrada.';
  END IF;

  IF auth.uid() IS NULL OR (auth.uid() <> v_message.sender_id AND NOT public.is_diretoria()) THEN
    RAISE EXCEPTION 'Sem permissão para apagar esta mensagem para todos.';
  END IF;

  IF v_message.deleted_at IS NOT NULL THEN
    RETURN v_message;
  END IF;

  UPDATE public.direct_messages
     SET body = NULL,
         attachment = jsonb_build_object('kind', 'deleted', 'label', 'Mensagem apagada'),
         deleted_at = now(),
         metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{event}', '"message_deleted"'::jsonb, true)
   WHERE id = p_message_id
   RETURNING * INTO v_message;

  RETURN v_message;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_direct_messages(
  p_conversation_id uuid,
  p_limit integer DEFAULT 24
) RETURNS TABLE (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  body text,
  attachment jsonb,
  metadata jsonb,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz,
  sender jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    dm.id,
    dm.conversation_id,
    dm.sender_id,
    dm.body,
    dm.attachment,
    dm.metadata,
    dm.edited_at,
    dm.deleted_at,
    dm.created_at,
    jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'username', p.username,
      'initials', p.initials,
      'color', p.color,
      'avatar_url', p.avatar_url
    ) AS sender
  FROM public.direct_messages dm
  JOIN public.profiles p ON p.id = dm.sender_id
  LEFT JOIN public.direct_message_user_state dmus
    ON dmus.message_id = dm.id
   AND dmus.user_id = auth.uid()
  WHERE dm.conversation_id = p_conversation_id
    AND (public.direct_is_participant(dm.conversation_id) OR public.is_diretoria())
    AND dmus.hidden_at IS NULL
  ORDER BY dm.created_at DESC, dm.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 24), 1), 120);
$$;

CREATE OR REPLACE FUNCTION public.get_direct_conversations()
RETURNS TABLE (
  conversation_id uuid,
  joined_at timestamptz,
  last_read_at timestamptz,
  last_notified_at timestamptz,
  is_archived boolean,
  is_muted boolean,
  kind text,
  title text,
  metadata jsonb,
  last_message_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  unread_count integer,
  participants jsonb,
  last_message jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    dp.conversation_id,
    dp.joined_at,
    dp.last_read_at,
    dp.last_notified_at,
    dp.is_archived,
    dp.is_muted,
    dc.kind,
    dc.title,
    dc.metadata,
    COALESCE(lm.created_at, dc.last_message_at, dc.created_at) AS last_message_at,
    dc.created_at,
    dc.updated_at,
    (
      SELECT COUNT(*)::integer
      FROM public.direct_messages dm_count
      LEFT JOIN public.direct_message_user_state dmus_count
        ON dmus_count.message_id = dm_count.id
       AND dmus_count.user_id = auth.uid()
      WHERE dm_count.conversation_id = dp.conversation_id
        AND dm_count.sender_id <> auth.uid()
        AND dmus_count.hidden_at IS NULL
        AND (dp.last_read_at IS NULL OR dm_count.created_at > dp.last_read_at)
    ) AS unread_count,
    (
      SELECT jsonb_agg(jsonb_build_object(
        'user_id', dpp.user_id,
        'joined_at', dpp.joined_at,
        'last_read_at', dpp.last_read_at,
        'is_archived', dpp.is_archived,
        'is_muted', dpp.is_muted,
        'profile', jsonb_build_object(
          'id', pr.id,
          'name', pr.name,
          'username', pr.username,
          'role', pr.role,
          'tier', pr.tier,
          'initials', pr.initials,
          'color', pr.color,
          'avatar_url', pr.avatar_url,
          'banner_url', pr.banner_url,
          'social_bio', pr.social_bio,
          'bio', pr.bio
        )
      ) ORDER BY dpp.joined_at ASC, dpp.user_id)
      FROM public.direct_participants dpp
      JOIN public.profiles pr ON pr.id = dpp.user_id
      WHERE dpp.conversation_id = dp.conversation_id
    ) AS participants,
    CASE
      WHEN lm.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', lm.id,
        'conversation_id', lm.conversation_id,
        'sender_id', lm.sender_id,
        'body', lm.body,
        'attachment', lm.attachment,
        'metadata', lm.metadata,
        'edited_at', lm.edited_at,
        'deleted_at', lm.deleted_at,
        'created_at', lm.created_at,
        'sender', jsonb_build_object(
          'id', sp.id,
          'name', sp.name,
          'username', sp.username,
          'initials', sp.initials,
          'color', sp.color,
          'avatar_url', sp.avatar_url
        )
      )
    END AS last_message
  FROM public.direct_participants dp
  JOIN public.direct_conversations dc ON dc.id = dp.conversation_id
  LEFT JOIN LATERAL (
    SELECT dm.*
    FROM public.direct_messages dm
    LEFT JOIN public.direct_message_user_state dmus
      ON dmus.message_id = dm.id
     AND dmus.user_id = auth.uid()
    WHERE dm.conversation_id = dp.conversation_id
      AND dmus.hidden_at IS NULL
    ORDER BY dm.created_at DESC, dm.id DESC
    LIMIT 1
  ) lm ON true
  LEFT JOIN public.profiles sp ON sp.id = lm.sender_id
  WHERE dp.user_id = auth.uid()
    AND dp.is_archived = false
  ORDER BY COALESCE(lm.created_at, dc.last_message_at, dc.created_at) DESC NULLS LAST, dc.updated_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.update_direct_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_direct_message_for_me(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_direct_message_for_all(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_direct_messages(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_direct_conversations() TO authenticated;

-- ── STORIES: METADADOS E RPC SEGURA ─────────────────────────
ALTER TABLE public.social_post_media
  ADD COLUMN IF NOT EXISTS media_meta jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.social_stories
  ADD COLUMN IF NOT EXISTS media_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS thumbnail_storage_path text;

CREATE OR REPLACE FUNCTION public.delete_social_story(p_story_id uuid)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_story public.social_stories%ROWTYPE;
  v_paths text[];
BEGIN
  SELECT *
    INTO v_story
  FROM public.social_stories
  WHERE id = p_story_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Story não encontrado.';
  END IF;

  IF auth.uid() IS NULL OR (auth.uid() <> v_story.author_id AND NOT public.is_diretoria()) THEN
    RAISE EXCEPTION 'Sem permissão para excluir este story.';
  END IF;

  v_paths := ARRAY_REMOVE(ARRAY[v_story.storage_path, v_story.thumbnail_storage_path], NULL);

  UPDATE public.social_stories
     SET deleted_at = now(),
         updated_at = now(),
         edited_at = COALESCE(edited_at, now())
   WHERE id = p_story_id;

  RETURN COALESCE(v_paths, ARRAY[]::text[]);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_social_story(uuid) TO authenticated;

-- ── FEED_ATIVIDADE: CAMPOS NOVOS + POLICIES ─────────────────
ALTER TABLE public.feed_atividade
  ADD COLUMN IF NOT EXISTS imagem_url text,
  ADD COLUMN IF NOT EXISTS imagem_storage_path text,
  ADD COLUMN IF NOT EXISTS data_atividade date,
  ADD COLUMN IF NOT EXISTS horario_atividade time,
  ADD COLUMN IF NOT EXISTS localizacao text,
  ADD COLUMN IF NOT EXISTS categoria text;

DROP POLICY IF EXISTS "Diretoria/perm publica feed" ON public.feed_atividade;
CREATE POLICY "Diretoria/perm publica feed"
  ON public.feed_atividade FOR INSERT
  WITH CHECK (
    (public.is_diretoria() AND auth.uid() = autor_id)
    OR (auth.uid() = autor_id AND public.has_permission('publicar_feed'))
  );

DROP POLICY IF EXISTS "Diretoria edita feed" ON public.feed_atividade;
CREATE POLICY "Diretoria edita feed"
  ON public.feed_atividade FOR UPDATE
  USING (public.is_diretoria() OR auth.uid() = autor_id)
  WITH CHECK (public.is_diretoria() OR auth.uid() = autor_id);

DROP POLICY IF EXISTS "Diretoria deleta feed" ON public.feed_atividade;
CREATE POLICY "Diretoria deleta feed"
  ON public.feed_atividade FOR DELETE
  USING (public.is_diretoria() OR auth.uid() = autor_id);
