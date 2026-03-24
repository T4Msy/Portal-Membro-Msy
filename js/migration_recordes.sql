-- ============================================================
-- MSY PORTAL — MIGRATION RECORDES
-- Recordes Históricos + Correção de Preferências de Notificação
-- Execute no SQL Editor do Supabase
-- ============================================================

-- ── Tabela: msy_recordes ──────────────────────────────────
-- Armazena recordes históricos (apenas o diário é manual;
-- semanal e mensal são calculados em tempo real pelo JS)

CREATE TABLE IF NOT EXISTS public.msy_recordes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo        text NOT NULL CHECK (tipo IN ('diario', 'semanal', 'mensal')),
  nome        text NOT NULL,               -- nome do membro detentor do recorde
  mensagens   integer NOT NULL CHECK (mensagens > 0),
  periodo     text,                        -- descrição textual do período (ex: "14/03/2025")
  updated_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (tipo)                            -- um único recorde por tipo
);

CREATE INDEX IF NOT EXISTS idx_msy_recordes_tipo ON public.msy_recordes(tipo);

ALTER TABLE public.msy_recordes ENABLE ROW LEVEL SECURITY;

-- Todos os membros ativos podem ler os recordes
DROP POLICY IF EXISTS "Membros leem recordes" ON public.msy_recordes;
CREATE POLICY "Membros leem recordes"
  ON public.msy_recordes FOR SELECT
  USING (true);

-- Apenas diretoria pode inserir ou atualizar recordes
DROP POLICY IF EXISTS "Diretoria gerencia recordes" ON public.msy_recordes;
CREATE POLICY "Diretoria gerencia recordes"
  ON public.msy_recordes FOR ALL
  USING (public.is_diretoria())
  WITH CHECK (public.is_diretoria());

-- Trigger: atualiza updated_at automaticamente
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

-- ── Correção: Policy de UPDATE no profiles para preferências ─
-- Garante que o próprio membro pode atualizar suas prefs de notificação
-- (notif_push, notif_email, notif_email_address)

DROP POLICY IF EXISTS "Membro atualiza proprias prefs" ON public.profiles;
CREATE POLICY "Membro atualiza proprias prefs"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Se já existe uma policy de UPDATE mais ampla, esta coexiste sem conflito.
-- Caso a policy existente seja restritiva demais, ajuste conforme necessário.

-- ── Verificação: colunas de notificação existem no profiles ──
-- (caso a migration_notificacoes.sql não tenha sido executada ainda)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notif_push          boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_email         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notif_email_address text;
