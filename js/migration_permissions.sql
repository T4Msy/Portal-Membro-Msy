-- ============================================================
-- MSY PORTAL — Migration: Sistema de Permissões
-- Execute no Supabase Dashboard > SQL Editor
-- ============================================================

-- Tabela de permissões individuais por membro
CREATE TABLE IF NOT EXISTS public.member_permissions (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  permissions text[] DEFAULT '{}',
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- Habilitar RLS
ALTER TABLE public.member_permissions ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas se existirem
DROP POLICY IF EXISTS "diretoria_full_access_perms"  ON public.member_permissions;
DROP POLICY IF EXISTS "member_read_own_perms"         ON public.member_permissions;
DROP POLICY IF EXISTS "diretoria_select_perms"        ON public.member_permissions;
DROP POLICY IF EXISTS "diretoria_insert_perms"        ON public.member_permissions;
DROP POLICY IF EXISTS "diretoria_update_perms"        ON public.member_permissions;
DROP POLICY IF EXISTS "diretoria_delete_perms"        ON public.member_permissions;

-- Diretoria: SELECT
CREATE POLICY "diretoria_select_perms"
ON public.member_permissions FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND tier = 'diretoria')
  OR user_id = auth.uid()
);

-- Diretoria: INSERT
CREATE POLICY "diretoria_insert_perms"
ON public.member_permissions FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND tier = 'diretoria')
);

-- Diretoria: UPDATE
CREATE POLICY "diretoria_update_perms"
ON public.member_permissions FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND tier = 'diretoria')
);

-- Diretoria: DELETE
CREATE POLICY "diretoria_delete_perms"
ON public.member_permissions FOR DELETE
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND tier = 'diretoria')
);

-- Índice para performance
CREATE INDEX IF NOT EXISTS idx_member_permissions_user_id
ON public.member_permissions(user_id);

COMMENT ON TABLE public.member_permissions IS
  'Permissões individuais dos membros do portal MSY. Independentes de cargo.';
