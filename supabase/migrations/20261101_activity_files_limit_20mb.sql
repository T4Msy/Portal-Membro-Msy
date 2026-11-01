-- ============================================================
-- MSY Portal - Activity files storage limit 20MB
-- Antes era 100MB (20260612_activity_files_bucket_limit.sql). Arquivos grandes
-- estouravam a cota de egress: um vídeo de 48MB aberto 4 vezes = ~190MB.
-- O site limita vídeo a 20MB e o resto a 10MB; o bucket barra acima de 20MB.
-- Arquivos que já estão no bucket não são afetados.
-- Aplicar no Supabase SQL Editor.
-- ============================================================

UPDATE storage.buckets
SET file_size_limit = 20971520
WHERE id = 'activity-files';
