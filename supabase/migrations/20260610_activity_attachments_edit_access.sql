-- ============================================================
-- MSY Portal - Activity attachments edit access
-- Allow append attachments during activity editing
-- ============================================================

DROP POLICY IF EXISTS "Diretoria/perm cria anexos de atividades" ON public.activity_attachments;
CREATE POLICY "Diretoria/perm cria anexos de atividades"
  ON public.activity_attachments FOR INSERT
  WITH CHECK (
    public.has_permission('criar_atividades')
    OR public.has_permission('editar_atividades')
    OR public.has_permission('gerenciar_atividades')
  );

