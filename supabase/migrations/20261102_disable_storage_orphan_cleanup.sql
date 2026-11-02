-- ============================================================
-- Desliga a limpeza diária do Supabase Storage (cron storage-orphan-cleanup)
-- Os buckets públicos (activity-files, social-media, jornal-media, space-profile-media)
-- foram para o Cloudflare R2 e foram esvaziados em 02/11/2026; a limpeza de órfãos
-- agora acontece no Worker msy-media (ver INFRAESTRUTURA.md §4). A rotina lia todas as
-- tabelas do banco todo dia e, na máquina Nano do plano Free, pesava no Disk IO Budget
-- (o banco travou em 02/11/2026 de manhã e foi preciso reiniciar o projeto).
-- A Edge Function storage-cleanup e a função storage_orphan_files continuam existindo;
-- para religar, rode de novo o cron.schedule de 20261101_storage_orphan_cleanup.sql.
-- Aplicado no SQL Editor em 02/11/2026.
-- ============================================================

SELECT cron.unschedule('storage-orphan-cleanup');
