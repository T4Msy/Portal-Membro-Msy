-- Allows authorized cleanup of test drafts/cancelled calculations only.
-- Approved, settled or paid financial records remain immutable.
BEGIN;
CREATE OR REPLACE FUNCTION commission_private.delete_project(p_id uuid, p_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  project_row public.commission_projects%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('commission.delete') THEN
    RAISE EXCEPTION 'Sem permissão para excluir cálculos.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO project_row FROM public.commission_projects WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cálculo não encontrado.'; END IF;
  IF project_row.version IS DISTINCT FROM p_version THEN
    RAISE EXCEPTION 'Este cálculo mudou em outra sessão. Recarregue antes de excluir.' USING ERRCODE='40001';
  END IF;
  IF project_row.status NOT IN ('draft','cancelled') THEN
    RAISE EXCEPTION 'Somente rascunhos ou cálculos cancelados podem ser excluídos.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.commission_payments WHERE project_id = p_id) THEN
    RAISE EXCEPTION 'Cálculos com pagamentos não podem ser excluídos.';
  END IF;
  -- Child rows are removed only after the explicit confirmation above.
  DELETE FROM public.commission_evidence WHERE project_id = p_id;
  DELETE FROM public.commission_history WHERE project_id = p_id;
  DELETE FROM public.commission_revisions WHERE project_id = p_id;
  DELETE FROM public.commission_project_members WHERE project_id = p_id;
  DELETE FROM public.commission_projects WHERE id = p_id;
  RETURN jsonb_build_object('deleted', true, 'id', p_id);
END;
$$;
CREATE OR REPLACE FUNCTION public.commission_delete(p_id uuid, p_version integer)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT commission_private.delete_project(p_id, p_version);
$$;
REVOKE ALL ON FUNCTION commission_private.delete_project(uuid,integer), public.commission_delete(uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION commission_private.delete_project(uuid,integer), public.commission_delete(uuid,integer) TO authenticated;
COMMIT;
