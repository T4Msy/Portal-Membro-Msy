-- Comissionamento MSY. Additive migration; requires existing profiles/projects,
-- has_permission(), can_access_tab(), member_permissions and tab_permissions.
-- CLI unavailable in the implementation sandbox; validate in staging before apply.
BEGIN;
CREATE SCHEMA IF NOT EXISTS commission_private;
REVOKE ALL ON SCHEMA commission_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA commission_private TO authenticated;

CREATE TABLE public.commission_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  input jsonb NOT NULL,
  result jsonb NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','approved','pending','paid','cancelled')),
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  settled_at date,
  settled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.commission_projects.input IS 'Versioned inputs: project_name, client_name, project_date, gross_cents, notes, referral_source, referral_user_id, costs[{description,amount_cents}], members[{user_id,roles,weight_bp,participation,justification}].';
CREATE TABLE public.commission_project_members (
  project_id uuid NOT NULL REFERENCES public.commission_projects(id) ON DELETE RESTRICT,
  member_key uuid NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  name_snapshot text NOT NULL,
  roles text[] NOT NULL DEFAULT '{}',
  weight_bp integer NOT NULL CHECK (weight_bp BETWEEN 0 AND 10000),
  participation integer CHECK (participation IS NULL OR participation IN (0,50,75,100)),
  base_cents bigint NOT NULL CHECK (base_cents >= 0),
  final_cents bigint NOT NULL CHECK (final_cents BETWEEN 0 AND base_cents),
  defined_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  defined_at timestamptz,
  justification text NOT NULL DEFAULT '',
  PRIMARY KEY (project_id, member_key)
);
CREATE TABLE public.commission_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.commission_projects(id) ON DELETE RESTRICT,
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, version)
);
CREATE TABLE public.commission_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.commission_projects(id) ON DELETE RESTRICT,
  revision_id uuid NOT NULL REFERENCES public.commission_revisions(id) ON DELETE RESTRICT,
  beneficiary_key uuid NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  name_snapshot text NOT NULL,
  payment_type text NOT NULL CHECK (payment_type IN ('execution','referral')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  paid_at date NOT NULL,
  registered_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, beneficiary_key, payment_type)
);
CREATE TABLE public.commission_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.commission_projects(id) ON DELETE RESTRICT,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name text NOT NULL,
  action text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.commission_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.commission_projects(id) ON DELETE RESTRICT,
  member_key uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('text','link','task','github','commit','pr','image','file','observation')),
  description text NOT NULL DEFAULT '',
  url text,
  file_path text UNIQUE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX commission_projects_created ON public.commission_projects(created_by, created_at DESC);
CREATE INDEX commission_projects_status ON public.commission_projects(status, created_at DESC);
CREATE INDEX commission_projects_link ON public.commission_projects(project_id);
CREATE INDEX commission_members_user ON public.commission_project_members(user_id, project_id);
CREATE INDEX commission_payments_user ON public.commission_payments(user_id, paid_at DESC);
CREATE INDEX commission_payments_revision ON public.commission_payments(revision_id);
CREATE INDEX commission_history_project ON public.commission_history(project_id, created_at DESC);
CREATE INDEX commission_evidence_project ON public.commission_evidence(project_id, member_key);

-- Financial tables have no direct client write/read grants. Purpose-specific RPCs
-- expose projections; this prevents own-view users reading project-wide money.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['commission_projects','commission_project_members','commission_revisions','commission_payments','commission_history','commission_evidence'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
  END LOOP;
END $$;

CREATE FUNCTION commission_private.allowed(p_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'ativo')
    AND public.can_access_tab('comissionamento')
    AND public.has_permission(p_permission);
$$;

CREATE FUNCTION commission_private.can_read(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT commission_private.allowed('commission.view_all') OR (
    commission_private.allowed('commission.create') AND EXISTS (
      SELECT 1 FROM public.commission_projects WHERE id = p_id AND created_by = auth.uid()
    )
  );
$$;

CREATE FUNCTION commission_private.calculate(p_input jsonb, p_strict boolean DEFAULT false)
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
    IF jsonb_typeof(item->'roles') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Funções inválidas.'; END IF;
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

CREATE FUNCTION commission_private.command(p_action text, p_id uuid, p_version integer, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  pr public.commission_projects%ROWTYPE; before_row jsonb; next_input jsonb; calc jsonb; item jsonb;
  uid uuid := auth.uid(); member_id uuid; person_name text; actor_name text; revision uuid;
  amount bigint; paid bigint; expected bigint; event_value jsonb; evidence_id uuid;
BEGIN
  IF NOT commission_private.allowed('commission.view_own') THEN RAISE EXCEPTION 'Acesso negado.' USING ERRCODE='42501'; END IF;
  SELECT name INTO actor_name FROM public.profiles WHERE id = uid;
  IF p_action = 'create' THEN
    IF NOT commission_private.allowed('commission.create') THEN RAISE EXCEPTION 'Sem permissão para criar.' USING ERRCODE='42501'; END IF;
    -- Client UUID makes a retry after an ambiguous network failure idempotent.
    IF p_id IS NULL THEN RAISE EXCEPTION 'Identificador obrigatório.'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
    SELECT * INTO pr FROM public.commission_projects WHERE id = p_id;
    IF FOUND THEN
      IF pr.created_by = uid AND pr.input = p_payload->'input' THEN RETURN to_jsonb(pr); END IF;
      RAISE EXCEPTION 'Este cálculo já foi criado. Recarregue a página.';
    END IF;
    calc := commission_private.calculate(p_payload->'input',false);
    INSERT INTO public.commission_projects(id,input,result,created_by)
      VALUES(p_id,p_payload->'input',calc,uid) RETURNING * INTO pr;
    before_row := NULL;
  ELSE
    SELECT * INTO pr FROM public.commission_projects WHERE id = p_id FOR UPDATE;
    IF NOT FOUND OR NOT commission_private.can_read(p_id) THEN RAISE EXCEPTION 'Cálculo indisponível.' USING ERRCODE='42501'; END IF;
    IF pr.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'Este cálculo mudou em outra sessão. Recarregue antes de continuar.' USING ERRCODE='40001'; END IF;
    before_row := to_jsonb(pr) || jsonb_build_object('member_snapshot',
      (SELECT jsonb_agg(to_jsonb(m)) FROM public.commission_project_members m WHERE project_id=p_id));
  END IF;
  IF p_action IN ('create','save') THEN
    IF p_action = 'save' AND NOT commission_private.allowed('commission.edit') THEN RAISE EXCEPTION 'Sem permissão para editar.' USING ERRCODE='42501'; END IF;
    IF pr.status = 'cancelled' OR EXISTS(SELECT 1 FROM public.commission_payments WHERE project_id=p_id) THEN RAISE EXCEPTION 'Valores bloqueados após pagamento ou cancelamento.'; END IF;
    next_input := p_payload->'input';
    IF octet_length(next_input::text) > 200000 THEN RAISE EXCEPTION 'Cálculo muito grande.'; END IF;
    calc := commission_private.calculate(next_input,false);
    IF nullif(next_input->>'project_id','') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.projects p WHERE p.id=(next_input->>'project_id')::uuid
        AND (public.is_diretoria() OR public.is_project_member(p.id))
    ) THEN RAISE EXCEPTION 'Projeto vinculado indisponível.'; END IF;
    member_id := nullif(next_input->>'referral_user_id','')::uuid;
    IF member_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=member_id AND
      (status='ativo' OR (p_action='save' AND pr.input->>'referral_user_id'=member_id::text))) THEN RAISE EXCEPTION 'Responsável pela indicação indisponível.'; END IF;
    -- Rebuild projections without resetting evidence (keyed by stable member UUID).
    FOR item IN SELECT value FROM jsonb_array_elements(calc->'members') LOOP
      member_id := nullif(item->>'user_id','')::uuid;
      IF member_id IS NULL THEN CONTINUE; END IF;
      SELECT name INTO person_name FROM public.profiles WHERE id=member_id AND (status='ativo'
        OR EXISTS(SELECT 1 FROM public.commission_project_members WHERE project_id=p_id AND member_key=member_id));
      IF NOT FOUND THEN RAISE EXCEPTION 'Participante indisponível.'; END IF;
      INSERT INTO public.commission_project_members(project_id,member_key,user_id,name_snapshot,roles,weight_bp,participation,base_cents,final_cents,justification)
      VALUES(p_id,member_id,member_id,person_name,ARRAY(SELECT jsonb_array_elements_text(item->'roles')),
        (item->>'weight_bp')::integer,(item->>'participation')::integer,(item->>'base_cents')::bigint,(item->>'final_cents')::bigint,coalesce(item->>'justification',''))
      ON CONFLICT(project_id,member_key) DO UPDATE SET roles=EXCLUDED.roles,weight_bp=EXCLUDED.weight_bp,
        participation=EXCLUDED.participation,base_cents=EXCLUDED.base_cents,final_cents=EXCLUDED.final_cents,
        justification=EXCLUDED.justification,defined_by=NULL,defined_at=NULL;
    END LOOP;
    DELETE FROM public.commission_project_members m WHERE m.project_id=p_id AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(calc->'members') v WHERE v->>'user_id'=m.member_key::text
    );
    UPDATE public.commission_projects SET input=next_input,result=calc,project_id=nullif(next_input->>'project_id','')::uuid,
      status='draft',approved_at=NULL,approved_by=NULL,
      settled_at=CASE WHEN input->>'gross_cents' IS DISTINCT FROM next_input->>'gross_cents' THEN NULL ELSE settled_at END,
      settled_by=CASE WHEN input->>'gross_cents' IS DISTINCT FROM next_input->>'gross_cents' THEN NULL ELSE settled_by END
      WHERE id=p_id;
  ELSIF p_action='review' THEN
    IF NOT commission_private.allowed('commission.edit') OR pr.status <> 'draft' THEN RAISE EXCEPTION 'Não é possível enviar para análise.'; END IF;
    PERFORM commission_private.calculate(pr.input,true);
    UPDATE public.commission_projects SET status='review' WHERE id=p_id;
  ELSIF p_action='approve' THEN
    IF NOT commission_private.allowed('commission.approve') OR pr.status NOT IN ('draft','review') THEN RAISE EXCEPTION 'Sem permissão ou estado inválido para aprovação.'; END IF;
    calc := commission_private.calculate(pr.input,true);
    UPDATE public.commission_projects SET result=calc,approved_by=uid,approved_at=now(),
      status=CASE WHEN settled_at IS NULL THEN 'approved' ELSE 'pending' END WHERE id=p_id;
    UPDATE public.commission_project_members SET defined_by=uid,defined_at=now() WHERE project_id=p_id;
    INSERT INTO public.commission_revisions(project_id,version,snapshot,approved_by)
      SELECT id,version+1,jsonb_build_object('project',to_jsonb(p),'members',
        (SELECT jsonb_agg(to_jsonb(m)) FROM public.commission_project_members m WHERE m.project_id=p_id),
        'referral_name',(SELECT name FROM public.profiles WHERE id=nullif(p.input->>'referral_user_id','')::uuid)),uid
      FROM public.commission_projects p WHERE id=p_id;
  ELSIF p_action='settle' THEN
    IF NOT commission_private.allowed('commission.mark_paid') OR pr.status <> 'approved' OR pr.settled_at IS NOT NULL THEN RAISE EXCEPTION 'Quitação indisponível.'; END IF;
    IF nullif(p_payload->>'date','') IS NULL OR (p_payload->>'date')::date > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN RAISE EXCEPTION 'Data de quitação inválida.'; END IF;
    UPDATE public.commission_projects SET settled_at=(p_payload->>'date')::date,settled_by=uid,status='pending' WHERE id=p_id;
  ELSIF p_action='pay' THEN
    IF NOT commission_private.allowed('commission.mark_paid') OR pr.status <> 'pending' OR pr.settled_at IS NULL OR pr.approved_at IS NULL THEN RAISE EXCEPTION 'Pagamento exige aprovação e quitação integral.'; END IF;
    member_id := (p_payload->>'user_id')::uuid;
    IF p_payload->>'payment_type'='execution' THEN
      SELECT final_cents,name_snapshot INTO amount,person_name FROM public.commission_project_members WHERE project_id=p_id AND member_key=member_id;
    ELSIF p_payload->>'payment_type'='referral' AND pr.input->>'referral_user_id'=member_id::text THEN
      amount := (pr.result->>'referral_cents')::bigint;
      SELECT coalesce(snapshot->>'referral_name','Membro removido') INTO person_name FROM public.commission_revisions WHERE project_id=p_id ORDER BY version DESC LIMIT 1;
    ELSE RAISE EXCEPTION 'Beneficiário ou tipo inválido.'; END IF;
    IF amount IS NULL OR amount <= 0 THEN RAISE EXCEPTION 'Não há valor a pagar.'; END IF;
    IF nullif(p_payload->>'date','') IS NULL OR (p_payload->>'date')::date < pr.settled_at
      OR (p_payload->>'date')::date < (pr.approved_at AT TIME ZONE 'America/Sao_Paulo')::date
      OR (p_payload->>'date')::date > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN RAISE EXCEPTION 'Data de pagamento inválida.'; END IF;
    SELECT id INTO revision FROM public.commission_revisions WHERE project_id=p_id ORDER BY version DESC LIMIT 1;
    INSERT INTO public.commission_payments(project_id,revision_id,beneficiary_key,user_id,name_snapshot,payment_type,amount_cents,paid_at,registered_by)
      VALUES(p_id,revision,member_id,(SELECT id FROM public.profiles WHERE id=member_id),person_name,p_payload->>'payment_type',amount,(p_payload->>'date')::date,uid);
  ELSIF p_action='cancel' THEN
    IF NOT commission_private.allowed('commission.delete') OR pr.status='cancelled'
      OR EXISTS(SELECT 1 FROM public.commission_payments WHERE project_id=p_id) THEN RAISE EXCEPTION 'Cancelamento indisponível.'; END IF;
    IF btrim(coalesce(p_payload->>'reason',''))='' THEN RAISE EXCEPTION 'Informe a justificativa.'; END IF;
    UPDATE public.commission_projects SET status='cancelled' WHERE id=p_id;
  ELSIF p_action='evidence' THEN
    IF NOT commission_private.allowed('commission.edit') OR pr.status='cancelled' THEN RAISE EXCEPTION 'Sem permissão para comprovações.'; END IF;
    member_id := (p_payload->>'user_id')::uuid;
    IF NOT EXISTS(SELECT 1 FROM public.commission_project_members WHERE project_id=p_id AND member_key=member_id) THEN RAISE EXCEPTION 'Participante inválido.'; END IF;
    IF nullif(p_payload->>'url','') IS NOT NULL AND p_payload->>'url' !~* '^https?://' THEN RAISE EXCEPTION 'Use links HTTP ou HTTPS.'; END IF;
    IF coalesce(p_payload->>'description','')='' AND coalesce(p_payload->>'url','')='' AND coalesce(p_payload->>'file_path','')='' THEN RAISE EXCEPTION 'Adicione uma comprovação.'; END IF;
    IF nullif(p_payload->>'file_path','') IS NOT NULL AND (split_part(p_payload->>'file_path','/',1)<>p_id::text
      OR split_part(p_payload->>'file_path','/',2)<>member_id::text
      OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='commission-evidence' AND name=p_payload->>'file_path')) THEN RAISE EXCEPTION 'Arquivo indisponível.'; END IF;
    INSERT INTO public.commission_evidence(project_id,member_key,type,description,url,file_path,created_by)
      VALUES(p_id,member_id,p_payload->>'type',coalesce(p_payload->>'description',''),nullif(p_payload->>'url',''),nullif(p_payload->>'file_path',''),uid)
      RETURNING id INTO evidence_id;
  ELSE RAISE EXCEPTION 'Operação desconhecida.';
  END IF;
  SELECT * INTO pr FROM public.commission_projects WHERE id=p_id;
  IF pr.status='pending' THEN
    expected := (pr.result->>'effective_execution_cents')::bigint + CASE WHEN nullif(pr.input->>'referral_user_id','') IS NULL THEN 0 ELSE (pr.result->>'referral_cents')::bigint END;
    SELECT coalesce(sum(amount_cents),0) INTO paid FROM public.commission_payments WHERE project_id=p_id;
    IF paid=expected THEN UPDATE public.commission_projects SET status='paid' WHERE id=p_id; END IF;
  END IF;
  UPDATE public.commission_projects SET version=version+CASE WHEN p_action='create' THEN 0 ELSE 1 END,updated_at=now()
    WHERE id=p_id RETURNING * INTO pr;
  event_value := to_jsonb(pr) || jsonb_build_object('details',p_payload-'input','evidence_id',evidence_id,'member_snapshot',
    (SELECT jsonb_agg(to_jsonb(m)) FROM public.commission_project_members m WHERE project_id=p_id));
  INSERT INTO public.commission_history(project_id,actor_id,actor_name,action,old_value,new_value)
    VALUES(p_id,uid,coalesce(actor_name,'Membro removido'),p_action,before_row,event_value);
  RETURN to_jsonb(pr);
END;
$$;

CREATE FUNCTION public.commission_command(p_action text,p_id uuid,p_version integer DEFAULT NULL,p_payload jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT commission_private.command(p_action,p_id,p_version,p_payload);
$$;

CREATE FUNCTION commission_private.read_data(p_id uuid DEFAULT NULL, p_own boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE output jsonb;
BEGIN
  IF NOT commission_private.allowed('commission.view_own') THEN RAISE EXCEPTION 'Acesso negado.' USING ERRCODE='42501'; END IF;
  IF p_own THEN
    SELECT coalesce(jsonb_agg(row_data ORDER BY project_date DESC),'[]') INTO output FROM (
      SELECT p.input->>'project_date' AS project_date,jsonb_build_object('id',p.id,'project_name',p.input->>'project_name',
        'project_date',p.input->>'project_date','status',p.status,'settled_at',p.settled_at,'approved_at',p.approved_at,
        'execution',(SELECT to_jsonb(m)-'defined_by'-'user_id' FROM public.commission_project_members m WHERE m.project_id=p.id AND m.user_id=auth.uid()),
        'referral_cents',CASE WHEN p.input->>'referral_user_id'=auth.uid()::text THEN (p.result->>'referral_cents')::bigint ELSE 0 END,
        'payments',coalesce((SELECT jsonb_agg(jsonb_build_object('payment_type',payment_type,'amount_cents',amount_cents,'paid_at',paid_at)) FROM public.commission_payments WHERE project_id=p.id AND user_id=auth.uid()),'[]')) row_data
      FROM public.commission_projects p WHERE p.approved_at IS NOT NULL AND p.status IN ('approved','pending','paid')
        AND (p.input->>'referral_user_id'=auth.uid()::text OR EXISTS(SELECT 1 FROM public.commission_project_members WHERE project_id=p.id AND user_id=auth.uid()))
    ) own_rows;
    RETURN jsonb_build_object('own',output);
  END IF;
  IF p_id IS NOT NULL THEN
    IF NOT commission_private.can_read(p_id) THEN RAISE EXCEPTION 'Acesso negado.' USING ERRCODE='42501'; END IF;
    RETURN jsonb_build_object('project',(SELECT to_jsonb(p) FROM public.commission_projects p WHERE id=p_id),
      'members',coalesce((SELECT jsonb_agg(to_jsonb(m)) FROM public.commission_project_members m WHERE project_id=p_id),'[]'),
      'payments',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM public.commission_payments p WHERE project_id=p_id),'[]'),
      'evidence',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY created_at) FROM public.commission_evidence e WHERE project_id=p_id),'[]'),
      'history',coalesce((SELECT jsonb_agg(to_jsonb(h) ORDER BY created_at DESC,id DESC) FROM public.commission_history h WHERE project_id=p_id),'[]'),
      'revisions',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY version DESC) FROM public.commission_revisions r WHERE project_id=p_id),'[]'));
  END IF;
  IF NOT (commission_private.allowed('commission.view_all') OR commission_private.allowed('commission.create')) THEN RAISE EXCEPTION 'Acesso negado.' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('projects',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY created_at DESC) FROM public.commission_projects p WHERE commission_private.can_read(id)),'[]'),
    'payments',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM public.commission_payments p WHERE commission_private.can_read(project_id)),'[]'),
    'history',coalesce((SELECT jsonb_agg(to_jsonb(h)) FROM (SELECT id,project_id,actor_name,action,created_at FROM public.commission_history WHERE commission_private.can_read(project_id) ORDER BY id DESC LIMIT 100) h),'[]'),
    'profiles',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'status',status) ORDER BY name) FROM public.profiles),'[]'),
    'linked_projects',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name)) FROM public.projects WHERE public.is_diretoria() OR public.is_project_member(id)),'[]'),
    'role_options',coalesce((SELECT jsonb_agg(name ORDER BY name) FROM public.project_role_options),'[]'));
END;
$$;
CREATE FUNCTION public.commission_read(p_id uuid DEFAULT NULL,p_own boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT commission_private.read_data(p_id,p_own); $$;

INSERT INTO public.tab_permissions(page_key,label,visible,required_permissions)
VALUES('comissionamento','Comissionamento',true,ARRAY['commission.view_own'])
ON CONFLICT(page_key) DO UPDATE SET required_permissions=ARRAY['commission.view_own'];

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('commission-evidence','commission-evidence',false,10485760,ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'])
ON CONFLICT(id) DO NOTHING;

CREATE FUNCTION commission_private.file_access(p_name text,p_write boolean)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE pid uuid; mid uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  BEGIN pid := split_part(p_name,'/',1)::uuid; mid := split_part(p_name,'/',2)::uuid;
  EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;
  RETURN commission_private.can_read(pid) AND (NOT p_write OR (
    commission_private.allowed('commission.edit') AND EXISTS(SELECT 1 FROM public.commission_projects WHERE id=pid AND status<>'cancelled')
    AND EXISTS(SELECT 1 FROM public.commission_project_members WHERE project_id=pid AND member_key=mid)));
END;
$$;
CREATE POLICY commission_files_read ON storage.objects FOR SELECT TO authenticated
  USING(bucket_id='commission-evidence' AND commission_private.file_access(name,false));
CREATE POLICY commission_files_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK(bucket_id='commission-evidence' AND commission_private.file_access(name,true));
-- No update/delete: published evidence remains immutable, including after payment.

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA commission_private FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION commission_private.command(text,uuid,integer,jsonb), commission_private.read_data(uuid,boolean), commission_private.file_access(text,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.commission_command(text,uuid,integer,jsonb), public.commission_read(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.commission_command(text,uuid,integer,jsonb), public.commission_read(uuid,boolean) TO authenticated;
COMMIT;
