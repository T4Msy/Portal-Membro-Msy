-- Halloween Masayoshi 2026 encerrado: remove o registro de quem viu o convite
-- (criado em 20261017_halloween_views.sql). Já aplicado no projeto em 26/11/2026.
DROP FUNCTION IF EXISTS public.halloween_track(text, text);
DROP TABLE IF EXISTS public.halloween_views;
