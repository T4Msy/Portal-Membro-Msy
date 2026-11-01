-- ============================================================
-- Central do Bot Corvus (página bot.html)
-- - bot_settings: configuração única (grupo padrão, quem pode usar)
-- - member_whatsapp.receive: se o membro recebe mensagens do bot
-- - bot_messages: histórico do que foi enviado pelo portal
-- Aplicar no Supabase SQL Editor.
-- ============================================================

-- ── Configuração (uma linha só, id = 1) ──────────────────────
CREATE TABLE IF NOT EXISTS public.bot_settings (
  id                 smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  default_group      text,
  default_group_name text,
  allowed_senders    uuid[] NOT NULL DEFAULT '{}',
  updated_at         timestamptz DEFAULT now(),
  updated_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Quem já usava na fase de testes: Xitter e Tales.
INSERT INTO public.bot_settings (id, allowed_senders)
VALUES (1, ARRAY['d15bace3-ea81-4d56-ac21-0af611e6cf1e', 'bcba3663-c3f9-4e2f-a134-1e2b240f11f6']::uuid[])
ON CONFLICT (id) DO NOTHING;

-- Quem está liberado para usar o bot pelo portal.
CREATE OR REPLACE FUNCTION public.is_bot_sender()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bot_settings
    WHERE id = 1 AND auth.uid() = ANY(allowed_senders)
  );
$$;

ALTER TABLE public.bot_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bot_settings_select" ON public.bot_settings;
DROP POLICY IF EXISTS "bot_settings_update" ON public.bot_settings;

-- Leitura: diretoria e quem está liberado no bot (não precisa ser diretoria).
CREATE POLICY "bot_settings_select" ON public.bot_settings FOR SELECT
USING (public.is_diretoria() OR public.is_bot_sender());

-- Alteração: só quem já está liberado no bot.
CREATE POLICY "bot_settings_update" ON public.bot_settings FOR UPDATE
USING (public.is_bot_sender())
WITH CHECK (public.is_bot_sender());

-- ── Quem recebe ──────────────────────────────────────────────
ALTER TABLE public.member_whatsapp
  ADD COLUMN IF NOT EXISTS receive boolean NOT NULL DEFAULT true;

-- Quem está liberado no bot cuida dos números na Central (aba Destinatários).
DROP POLICY IF EXISTS "member_whatsapp_select" ON public.member_whatsapp;
DROP POLICY IF EXISTS "member_whatsapp_insert" ON public.member_whatsapp;
DROP POLICY IF EXISTS "member_whatsapp_update" ON public.member_whatsapp;
DROP POLICY IF EXISTS "member_whatsapp_delete" ON public.member_whatsapp;

CREATE POLICY "member_whatsapp_select" ON public.member_whatsapp FOR SELECT
USING (
  user_id = auth.uid()
  OR public.is_diretoria()
  OR public.is_bot_sender()
  OR public.has_permission('gerenciar_atividades')
  OR public.has_permission('criar_atividades')
  OR public.has_permission('editar_atividades')
);

CREATE POLICY "member_whatsapp_insert" ON public.member_whatsapp FOR INSERT
WITH CHECK (user_id = auth.uid() OR public.is_diretoria() OR public.is_bot_sender());

CREATE POLICY "member_whatsapp_update" ON public.member_whatsapp FOR UPDATE
USING (user_id = auth.uid() OR public.is_diretoria() OR public.is_bot_sender())
WITH CHECK (user_id = auth.uid() OR public.is_diretoria() OR public.is_bot_sender());

CREATE POLICY "member_whatsapp_delete" ON public.member_whatsapp FOR DELETE
USING (user_id = auth.uid() OR public.is_diretoria() OR public.is_bot_sender());

-- ── Histórico de envios ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bot_messages (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sent_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_type text NOT NULL CHECK (target_type IN ('grupo', 'membro')),
  target      text NOT NULL,
  target_name text,
  message     text NOT NULL,
  ok          boolean NOT NULL,
  error       text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bot_messages_created_at_idx ON public.bot_messages (created_at DESC);

ALTER TABLE public.bot_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bot_messages_select" ON public.bot_messages;
DROP POLICY IF EXISTS "bot_messages_insert" ON public.bot_messages;

CREATE POLICY "bot_messages_select" ON public.bot_messages FOR SELECT
USING (public.is_bot_sender());

-- Gravado pela /api/whatsapp com o token de quem enviou.
CREATE POLICY "bot_messages_insert" ON public.bot_messages FOR INSERT
WITH CHECK (sent_by = auth.uid() AND public.is_bot_sender());
