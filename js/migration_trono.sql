-- ============================================================
-- MSY PORTAL — MIGRATION: Trono dos Recordes (Top 3)
-- Execute no SQL Editor do Supabase
-- ============================================================

-- ── Tabela: msy_recordes_top3 ─────────────────────────────
-- Armazena Top 3 histórico por categoria (semanal, mensal, diario)
-- Persiste independentemente dos relatórios

CREATE TABLE IF NOT EXISTS public.msy_recordes_top3 (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo        text NOT NULL CHECK (tipo IN ('semanal', 'mensal', 'diario')),
  posicao     integer NOT NULL CHECK (posicao IN (1, 2, 3)),
  nome        text NOT NULL,
  mensagens   integer NOT NULL CHECK (mensagens > 0),
  periodo     text,           -- ex: "Jan 2026" ou "Semana 01/01 a 07/01"
  data_ref    date,           -- data de referência do registro (para desempate)
  observacao  text,           -- campo livre (útil no diário)
  updated_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (tipo, posicao)      -- cada tipo tem exatamente 1 registro por posição
);

CREATE INDEX IF NOT EXISTS idx_recordes_top3_tipo ON public.msy_recordes_top3(tipo);

ALTER TABLE public.msy_recordes_top3 ENABLE ROW LEVEL SECURITY;

-- Leitura: todos os membros autenticados
DROP POLICY IF EXISTS "Membros leem top3" ON public.msy_recordes_top3;
CREATE POLICY "Membros leem top3"
  ON public.msy_recordes_top3 FOR SELECT
  USING (auth.role() = 'authenticated');

-- INSERT: diretoria
DROP POLICY IF EXISTS "Diretoria insere top3" ON public.msy_recordes_top3;
CREATE POLICY "Diretoria insere top3"
  ON public.msy_recordes_top3 FOR INSERT
  WITH CHECK (public.is_diretoria());

-- UPDATE: diretoria
DROP POLICY IF EXISTS "Diretoria atualiza top3" ON public.msy_recordes_top3;
CREATE POLICY "Diretoria atualiza top3"
  ON public.msy_recordes_top3 FOR UPDATE
  USING (public.is_diretoria())
  WITH CHECK (public.is_diretoria());

-- DELETE: diretoria
DROP POLICY IF EXISTS "Diretoria deleta top3" ON public.msy_recordes_top3;
CREATE POLICY "Diretoria deleta top3"
  ON public.msy_recordes_top3 FOR DELETE
  USING (public.is_diretoria());

-- Trigger: atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS msy_recordes_top3_updated_at ON public.msy_recordes_top3;
CREATE TRIGGER msy_recordes_top3_updated_at
  BEFORE UPDATE ON public.msy_recordes_top3
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
