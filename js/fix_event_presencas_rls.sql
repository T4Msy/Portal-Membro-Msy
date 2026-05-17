-- MSY Portal - fix para registro de presencas em eventos
-- Execute no Supabase Dashboard > SQL Editor.

ALTER TABLE public.event_presencas
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS justificativa TEXT;

UPDATE public.event_presencas
SET user_id = membro_id
WHERE user_id IS NULL
  AND membro_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'event_presencas_user_event_unique'
  ) THEN
    ALTER TABLE public.event_presencas
      ADD CONSTRAINT event_presencas_user_event_unique UNIQUE (event_id, user_id);
  END IF;
END$$;

ALTER TABLE public.event_presencas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ep_member_select ON public.event_presencas;
CREATE POLICY ep_member_select
ON public.event_presencas
FOR SELECT
USING (
  user_id = auth.uid()
  OR membro_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND tier = 'diretoria'
  )
  OR EXISTS (
    SELECT 1 FROM public.member_permissions
    WHERE user_id = auth.uid()
      AND (
        'gerenciar_presencas' = ANY(permissions)
        OR 'registrar_participantes' = ANY(permissions)
        OR 'gerenciar_eventos' = ANY(permissions)
      )
  )
);

DROP POLICY IF EXISTS ep_member_insert ON public.event_presencas;
CREATE POLICY ep_member_insert
ON public.event_presencas
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND tier = 'diretoria'
  )
  OR EXISTS (
    SELECT 1 FROM public.member_permissions
    WHERE user_id = auth.uid()
      AND (
        'gerenciar_presencas' = ANY(permissions)
        OR 'registrar_participantes' = ANY(permissions)
        OR 'gerenciar_eventos' = ANY(permissions)
      )
  )
);

DROP POLICY IF EXISTS ep_member_update ON public.event_presencas;
CREATE POLICY ep_member_update
ON public.event_presencas
FOR UPDATE
USING (
  user_id = auth.uid()
  OR membro_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND tier = 'diretoria'
  )
  OR EXISTS (
    SELECT 1 FROM public.member_permissions
    WHERE user_id = auth.uid()
      AND (
        'gerenciar_presencas' = ANY(permissions)
        OR 'registrar_participantes' = ANY(permissions)
        OR 'gerenciar_eventos' = ANY(permissions)
      )
  )
)
WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND tier = 'diretoria'
  )
  OR EXISTS (
    SELECT 1 FROM public.member_permissions
    WHERE user_id = auth.uid()
      AND (
        'gerenciar_presencas' = ANY(permissions)
        OR 'registrar_participantes' = ANY(permissions)
        OR 'gerenciar_eventos' = ANY(permissions)
      )
  )
);
