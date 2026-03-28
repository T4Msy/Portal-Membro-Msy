-- ============================================================
-- MSY PORTAL — Migration: Campo Data de Nascimento
-- Execute no Supabase Dashboard > SQL Editor
-- ============================================================

-- Adiciona coluna birth_date na tabela profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birth_date date;

-- RLS: apenas o próprio membro pode atualizar sua data de nascimento
-- A política existente de UPDATE já cobre isso (profiles só permite
-- que o próprio usuário atualize seu registro via auth.uid() = id).
-- Nenhuma política adicional é necessária se a RLS padrão já restringe
-- UPDATE ao próprio usuário. Confirme com:
-- SELECT * FROM pg_policies WHERE tablename = 'profiles';

-- Índice opcional para consultas de aniversário (ex: listar membros
-- que fazem aniversário em determinado mês)
CREATE INDEX IF NOT EXISTS idx_profiles_birth_date
  ON public.profiles(birth_date);

COMMENT ON COLUMN public.profiles.birth_date IS
  'Data de nascimento do membro. Editável apenas pelo próprio membro.';
