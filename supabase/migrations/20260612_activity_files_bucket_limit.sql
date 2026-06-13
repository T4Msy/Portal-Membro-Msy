-- ============================================================
-- MSY Portal - Activity files storage limit
-- Garante que anexos e respostas de atividades aceitem 100MB.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'activity-files',
  'activity-files',
  true,
  104857600,
  NULL
)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 104857600,
    allowed_mime_types = NULL;

DROP POLICY IF EXISTS "Membros leem arquivos de atividades" ON storage.objects;
CREATE POLICY "Membros leem arquivos de atividades"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'activity-files'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "Membros enviam seus arquivos de atividades" ON storage.objects;
CREATE POLICY "Membros enviam seus arquivos de atividades"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'activity-files'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Membros atualizam seus arquivos de atividades" ON storage.objects;
CREATE POLICY "Membros atualizam seus arquivos de atividades"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'activity-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'activity-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Membros removem arquivos de atividades" ON storage.objects;
CREATE POLICY "Membros removem arquivos de atividades"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'activity-files'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_diretoria()
    )
  );
