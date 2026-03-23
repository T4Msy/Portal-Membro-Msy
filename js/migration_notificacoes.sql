-- ============================================================
-- MSY PORTAL — MIGRATION NOTIFICAÇÕES
-- Push Web + Preferências de Email por usuário
-- Execute no SQL Editor do Supabase
-- ============================================================

-- ── Tabela: push_subscriptions ────────────────────────────
-- Armazena as assinaturas Web Push de cada dispositivo/browser
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint     text NOT NULL,
  p256dh       text NOT NULL,
  auth_key     text NOT NULL,
  device_label text,           -- ex: 'Chrome/Windows', 'Safari/iOS'
  created_at   timestamptz DEFAULT now(),
  UNIQUE (user_id, endpoint)   -- um registro por browser/dispositivo
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membro gerencia próprias subs" ON public.push_subscriptions;
CREATE POLICY "Membro gerencia próprias subs"
  ON public.push_subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Diretoria pode ler todas (para envio de push em massa)
DROP POLICY IF EXISTS "Diretoria lê todas subs" ON public.push_subscriptions;
CREATE POLICY "Diretoria lê todas subs"
  ON public.push_subscriptions FOR SELECT
  USING (public.is_diretoria());

-- ── Colunas de preferência na tabela profiles ─────────────
-- notif_push:  recebe notificações push no dispositivo
-- notif_email: recebe notificações por email
-- notif_email_address: email alternativo (opcional; usa o da conta se null)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notif_push  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_email boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notif_email_address text;

-- ── Enum de canais de envio para notify_member ────────────
-- A função notify_member existente grava na tabela notifications.
-- Adicionamos uma coluna para registrar se push/email foi disparado.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS push_sent  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_sent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS channels   text[]  DEFAULT ARRAY['portal'];
  -- channels: ['portal'] | ['portal','push'] | ['portal','push','email']
