-- ============================================================
-- MSY PORTAL — MIGRATION RECORDES (v2)
-- Recordes Históricos + Correção de Preferências de Notificação
-- Execute no SQL Editor do Supabase
-- ============================================================

-- ── Tabela: msy_recordes ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.msy_recordes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo        text NOT NULL CHECK (tipo IN ('diario', 'semanal', 'mensal')),
  nome        text NOT NULL,
  mensagens   integer NOT NULL CHECK (mensagens > 0),
  periodo     text,
  updated_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (tipo)
);

CREATE INDEX IF NOT EXISTS idx_msy_recordes_tipo ON public.msy_recordes(tipo);

ALTER TABLE public.msy_recordes ENABLE ROW LEVEL SECURITY;

-- Leitura: todos os membros autenticados
DROP POLICY IF EXISTS "Membros leem recordes" ON public.msy_recordes;
CREATE POLICY "Membros leem recordes"
  ON public.msy_recordes FOR SELECT
  USING (auth.role() = 'authenticated');

-- INSERT: diretoria (necessário para upsert quando registro não existe)
DROP POLICY IF EXISTS "Diretoria insere recordes" ON public.msy_recordes;
CREATE POLICY "Diretoria insere recordes"
  ON public.msy_recordes FOR INSERT
  WITH CHECK (public.is_diretoria());

-- UPDATE: diretoria (necessário para upsert quando registro já existe)
DROP POLICY IF EXISTS "Diretoria atualiza recordes" ON public.msy_recordes;
CREATE POLICY "Diretoria atualiza recordes"
  ON public.msy_recordes FOR UPDATE
  USING (public.is_diretoria())
  WITH CHECK (public.is_diretoria());

-- DELETE: diretoria
DROP POLICY IF EXISTS "Diretoria deleta recordes" ON public.msy_recordes;
CREATE POLICY "Diretoria deleta recordes"
  ON public.msy_recordes FOR DELETE
  USING (public.is_diretoria());

-- Trigger: atualiza updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS msy_recordes_updated_at ON public.msy_recordes;
CREATE TRIGGER msy_recordes_updated_at
  BEFORE UPDATE ON public.msy_recordes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Colunas de notificação no profiles ───────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notif_push          boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_email         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notif_email_address text;

-- ── Policy UPDATE no profiles para o próprio membro ──────
-- Necessária para salvar preferências de notificação via upsert
DROP POLICY IF EXISTS "Membro atualiza proprio perfil" ON public.profiles;
CREATE POLICY "Membro atualiza proprio perfil"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Upsert requer também policy de INSERT quando o Supabase
-- processa o conflito interno. Esta policy é restrita ao
-- próprio id do usuário autenticado.
DROP POLICY IF EXISTS "Membro upsert proprio perfil" ON public.profiles;
CREATE POLICY "Membro upsert proprio perfil"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);
