-- Incremental follow-up for installations that already applied
-- 20260908000000_commission.sql. Do not rerun the original migration.
BEGIN;

ALTER TABLE public.commission_project_members
  ALTER COLUMN participation DROP NOT NULL;

CREATE OR REPLACE FUNCTION commission_private.allowed(p_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'ativo')
    AND public.can_access_tab('comissionamento')
    AND public.has_permission(p_permission);
$$;

CREATE OR REPLACE FUNCTION commission_private.calculate(p_input jsonb, p_strict boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  gross bigint; costs bigint := 0; base bigint; referral bigint; execution bigint; company bigint;
  weight integer := 0; allocated bigint := 0; amount bigint; final_amount bigint; retained bigint := 0;
  item jsonb; rows jsonb := '[]'; errors jsonb := '[]'; idx integer := 0; last_positive integer := -1;
  seen text[] := '{}'; user_key text; member_count integer;
BEGIN
  IF jsonb_typeof(p_input) <> 'object' OR NOT (p_input ? 'gross_cents')
     OR coalesce(p_input->>'gross_cents','') !~ '^\d+$' THEN RAISE EXCEPTION 'Valor bruto inválido.'; END IF;
  gross := (p_input->>'gross_cents')::bigint;
  IF gross > 100000000000 THEN RAISE EXCEPTION 'Valor bruto fora do limite.'; END IF;
  IF jsonb_typeof(p_input->'costs') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'costs') > 100
    OR jsonb_typeof(p_input->'members') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'members') > 200
    THEN RAISE EXCEPTION 'Lista de custos ou participantes inválida.'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_input->'costs') LOOP
    IF coalesce(item->>'amount_cents','') !~ '^\d+$' OR (item->>'amount_cents')::numeric > 100000000000 THEN RAISE EXCEPTION 'Custo inválido.'; END IF;
    costs := costs + (item->>'amount_cents')::bigint;
    IF btrim(coalesce(item->>'description','')) = '' THEN errors := errors || '"Descreva todos os custos."'::jsonb; END IF;
  END LOOP;
  IF costs > gross THEN RAISE EXCEPTION 'Os custos não podem ultrapassar o valor do projeto.'; END IF;
  base := gross - costs;
  referral := (base * 10 + 50) / 100;
  execution := (base * 65 + 50) / 100;
  company := base - referral - execution;
  member_count := jsonb_array_length(p_input->'members');
  FOR item IN SELECT value FROM jsonb_array_elements(p_input->'members') LOOP
    IF coalesce(item->>'weight_bp','') !~ '^\d+$' OR (item->>'weight_bp')::numeric > 10000 THEN RAISE EXCEPTION 'Peso inválido.'; END IF;
    IF item->>'participation' IS NULL OR item->>'participation' = '' THEN
      errors := errors || '"Defina a participação de todos os participantes."'::jsonb;
    ELSIF item->>'participation' NOT IN ('0','50','75','100') THEN
      RAISE EXCEPTION 'Participação inválida.';
    END IF;
    IF jsonb_typeof(item->'roles') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Cargos inválidos.'; END IF;
    user_key := nullif(item->>'user_id','');
    IF user_key = ANY(seen) THEN RAISE EXCEPTION 'Participante duplicado.'; END IF;
    IF user_key IS NOT NULL THEN seen := array_append(seen, user_key); ELSE errors := errors || '"Selecione os participantes."'::jsonb; END IF;
    weight := weight + (item->>'weight_bp')::integer;
    IF (item->>'weight_bp')::integer > 0 THEN last_positive := idx; END IF;
    idx := idx + 1;
  END LOOP;
  IF btrim(coalesce(p_input->>'project_name','')) = '' THEN errors := errors || '"Informe o nome do projeto."'::jsonb; END IF;
  IF btrim(coalesce(p_input->>'client_name','')) = '' THEN errors := errors || '"Informe o cliente."'::jsonb; END IF;
  IF coalesce(p_input->>'project_date','') = '' THEN errors := errors || '"Informe a data do projeto."'::jsonb;
  ELSE PERFORM (p_input->>'project_date')::date; END IF;
  IF gross = 0 THEN errors := errors || '"Informe um valor de projeto maior que zero."'::jsonb; END IF;
  IF coalesce(p_input->>'referral_source','') NOT IN ('Indicação direta','Instagram','Site','Marketing','Prospecção','Outro','MSY / Origem institucional') THEN errors := errors || '"Selecione a origem do cliente."'::jsonb; END IF;
  IF weight <> 10000 OR member_count = 0 THEN errors := errors || '"Os pesos precisam somar exatamente 100%."'::jsonb; END IF;
  IF p_strict AND jsonb_array_length(errors) > 0 THEN RAISE EXCEPTION '%', errors; END IF;
  idx := 0;
  FOR item IN SELECT value FROM jsonb_array_elements(p_input->'members') LOOP
    IF weight = 10000 AND idx = last_positive THEN amount := execution - allocated;
    ELSE amount := execution * (item->>'weight_bp')::bigint / 10000; END IF;
    allocated := allocated + amount;
    final_amount := (amount * coalesce((item->>'participation')::bigint,0) + 50) / 100;
    retained := retained + amount - final_amount;
    rows := rows || jsonb_build_array(item || jsonb_build_object('base_cents',amount,'final_cents',final_amount,'retained_cents',amount-final_amount));
    idx := idx + 1;
  END LOOP;
  RETURN jsonb_build_object('gross_cents',gross,'costs_cents',costs,'distribution_cents',base,
    'company_cents',company,'referral_cents',referral,'execution_cents',execution,
    'effective_execution_cents',allocated-retained,'retained_cents',retained,
    'company_total_cents',company+retained+CASE WHEN nullif(p_input->>'referral_user_id','') IS NULL THEN referral ELSE 0 END,
    'weight_bp',weight,'members',rows,'valid',jsonb_array_length(errors)=0,'errors',errors);
END;
$$;

INSERT INTO public.tab_permissions(page_key,label,visible,required_permissions)
VALUES('comissionamento','Comissionamento',true,ARRAY['commission.view_own'])
ON CONFLICT(page_key) DO UPDATE SET required_permissions=ARRAY['commission.view_own'];

COMMIT;
