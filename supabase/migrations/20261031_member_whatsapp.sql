-- ============================================================
-- WhatsApp dos membros (notificações pelo bot Corvus)
-- Tabela separada de profiles para o número NÃO ficar visível a
-- todos os membros: só o próprio membro, a diretoria e quem gerencia
-- atividades (quem pode mandar notificação) conseguem ler.
-- Aplicar no Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.member_whatsapp (
  user_id    uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  whatsapp   text NOT NULL CHECK (whatsapp ~ '^[0-9]{12,13}$'),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.member_whatsapp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "member_whatsapp_select" ON public.member_whatsapp;
DROP POLICY IF EXISTS "member_whatsapp_insert" ON public.member_whatsapp;
DROP POLICY IF EXISTS "member_whatsapp_update" ON public.member_whatsapp;
DROP POLICY IF EXISTS "member_whatsapp_delete" ON public.member_whatsapp;

CREATE POLICY "member_whatsapp_select" ON public.member_whatsapp FOR SELECT
USING (
  user_id = auth.uid()
  OR public.is_diretoria()
  OR public.has_permission('gerenciar_atividades')
  OR public.has_permission('criar_atividades')
  OR public.has_permission('editar_atividades')
);

CREATE POLICY "member_whatsapp_insert" ON public.member_whatsapp FOR INSERT
WITH CHECK (user_id = auth.uid() OR public.is_diretoria());

CREATE POLICY "member_whatsapp_update" ON public.member_whatsapp FOR UPDATE
USING (user_id = auth.uid() OR public.is_diretoria())
WITH CHECK (user_id = auth.uid() OR public.is_diretoria());

CREATE POLICY "member_whatsapp_delete" ON public.member_whatsapp FOR DELETE
USING (user_id = auth.uid() OR public.is_diretoria());
