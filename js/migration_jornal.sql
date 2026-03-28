-- ============================================================
-- MSY PORTAL — Migration: Jornal MSY
-- Execute no Supabase Dashboard > SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.jornal_avisos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mensagem    text NOT NULL,
  icone       text NOT NULL DEFAULT '📢',
  prioridade  integer NOT NULL DEFAULT 0 CHECK (prioridade IN (0,1,2)),
  ativo       boolean NOT NULL DEFAULT true,
  autor_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  autor_nome  text,
  expira_em   timestamptz,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jornal_avisos_ativo ON public.jornal_avisos(ativo);
CREATE INDEX IF NOT EXISTS idx_jornal_avisos_created ON public.jornal_avisos(created_at DESC);

ALTER TABLE public.jornal_avisos ENABLE ROW LEVEL SECURITY;

-- Todos os membros autenticados podem ler
DROP POLICY IF EXISTS "membros_leem_jornal" ON public.jornal_avisos;
CREATE POLICY "membros_leem_jornal"
  ON public.jornal_avisos FOR SELECT
  USING (auth.role() = 'authenticated');

-- Apenas diretoria pode inserir
DROP POLICY IF EXISTS "diretoria_insere_jornal" ON public.jornal_avisos;
CREATE POLICY "diretoria_insere_jornal"
  ON public.jornal_avisos FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND tier = 'diretoria')
  );

-- Apenas diretoria pode atualizar
DROP POLICY IF EXISTS "diretoria_atualiza_jornal" ON public.jornal_avisos;
CREATE POLICY "diretoria_atualiza_jornal"
  ON public.jornal_avisos FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND tier = 'diretoria')
  );

-- Apenas diretoria pode deletar
DROP POLICY IF EXISTS "diretoria_deleta_jornal" ON public.jornal_avisos;
CREATE POLICY "diretoria_deleta_jornal"
  ON public.jornal_avisos FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND tier = 'diretoria')
  );

COMMENT ON TABLE public.jornal_avisos IS
  'Avisos manuais publicados no Jornal MSY da dashboard.';
