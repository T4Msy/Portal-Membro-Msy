-- Anexos de atas de reunião.
-- Bucket privado: só a gestão e os leitores escolhidos da ata acessam os arquivos.
-- Caminho dos arquivos: <minute_id>/<arquivo>. Seguro para rodar mais de uma vez.

CREATE OR REPLACE FUNCTION public.can_read_minute(p_minute_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_permission('gerenciar_reunioes')
    OR EXISTS (
      SELECT 1 FROM public.meeting_minute_viewers v
      WHERE v.minute_id = p_minute_id AND v.user_id = auth.uid()
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_read_minute(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.meeting_minute_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  minute_id uuid NOT NULL REFERENCES public.meeting_minutes(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  mime_type text,
  file_size bigint,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meeting_minute_attachments_minute
  ON public.meeting_minute_attachments(minute_id, created_at);

ALTER TABLE public.meeting_minute_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitores da ata leem anexos" ON public.meeting_minute_attachments;
CREATE POLICY "Leitores da ata leem anexos"
  ON public.meeting_minute_attachments FOR SELECT
  USING (public.can_read_minute(minute_id));

DROP POLICY IF EXISTS "Gestão administra anexos de atas" ON public.meeting_minute_attachments;
CREATE POLICY "Gestão administra anexos de atas"
  ON public.meeting_minute_attachments FOR ALL
  USING (public.has_permission('gerenciar_reunioes'))
  WITH CHECK (public.has_permission('gerenciar_reunioes'));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('meeting-files', 'meeting-files', false, 104857600, NULL)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 104857600;

DROP POLICY IF EXISTS "Leitores da ata baixam anexos" ON storage.objects;
CREATE POLICY "Leitores da ata baixam anexos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'meeting-files'
    AND CASE
      WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN public.can_read_minute(((storage.foldername(name))[1])::uuid)
      ELSE false
    END
  );

DROP POLICY IF EXISTS "Gestão envia anexos de atas" ON storage.objects;
CREATE POLICY "Gestão envia anexos de atas"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'meeting-files'
    AND public.has_permission('gerenciar_reunioes')
  );

DROP POLICY IF EXISTS "Gestão remove anexos de atas" ON storage.objects;
CREATE POLICY "Gestão remove anexos de atas"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'meeting-files'
    AND public.has_permission('gerenciar_reunioes')
  );
