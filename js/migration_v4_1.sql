-- ============================================================
-- MSY PORTAL — MIGRATION v4.1
-- Adiciona tipo ao weekly_rankings (semanal/mensal)
-- Execute no SQL Editor do Supabase
-- ============================================================

ALTER TABLE public.weekly_rankings
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'semanal'
    CHECK (tipo IN ('semanal', 'mensal'));

-- Índice para filtrar por tipo
CREATE INDEX IF NOT EXISTS idx_weekly_rankings_tipo ON public.weekly_rankings(tipo);

-- Coluna updated_at no feed para suporte a edição
ALTER TABLE public.feed_atividade
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Policy de update no feed para diretoria
DROP POLICY IF EXISTS "Diretoria edita feed" ON public.feed_atividade;
CREATE POLICY "Diretoria edita feed"
  ON public.feed_atividade FOR UPDATE
  USING (public.is_diretoria());

-- Policy de delete no feed para diretoria
DROP POLICY IF EXISTS "Diretoria deleta feed" ON public.feed_atividade;
CREATE POLICY "Diretoria deleta feed"
  ON public.feed_atividade FOR DELETE
  USING (public.is_diretoria() OR auth.uid() = autor_id);
