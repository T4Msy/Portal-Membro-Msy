-- ============================================================
-- MSY Portal - Anexos de atividades
-- Persistência de arquivos enviados na criação da atividade
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_access_activity(p_activity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.activities a
    WHERE a.id = p_activity_id
      AND (
        public.is_diretoria()
        OR a.assigned_to = auth.uid()
        OR a.assigned_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.activity_collaborators ac
          WHERE ac.activity_id = a.id
            AND ac.user_id = auth.uid()
        )
      )
  );
$$;

CREATE TABLE IF NOT EXISTS public.activity_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_path text,
  mime_type text,
  file_size bigint,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_attachments_activity
  ON public.activity_attachments(activity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_attachments_created_by
  ON public.activity_attachments(created_by, created_at DESC);

ALTER TABLE public.activity_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros leem anexos de atividades" ON public.activity_attachments;
CREATE POLICY "Membros leem anexos de atividades"
  ON public.activity_attachments FOR SELECT
  USING (public.can_access_activity(activity_id));

DROP POLICY IF EXISTS "Diretoria/perm cria anexos de atividades" ON public.activity_attachments;
CREATE POLICY "Diretoria/perm cria anexos de atividades"
  ON public.activity_attachments FOR INSERT
  WITH CHECK (public.has_permission('criar_atividades'));

DROP POLICY IF EXISTS "Diretoria remove anexos de atividades" ON public.activity_attachments;
CREATE POLICY "Diretoria remove anexos de atividades"
  ON public.activity_attachments FOR DELETE
  USING (
    public.is_diretoria()
    OR created_by = auth.uid()
  );

COMMENT ON TABLE public.activity_attachments IS
  'Arquivos anexados diretamente na criação ou manutenção de uma atividade.';
