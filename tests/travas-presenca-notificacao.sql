-- Teste da migration 20261127_travas_presenca_e_notificacao.sql num Postgres local que imita o Supabase.
-- Rodar: psql -v ON_ERROR_STOP=1 -f tests/travas-presenca-notificacao.sql  (num banco vazio, de dentro de tests/)
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
CREATE TABLE public.profiles(id uuid PRIMARY KEY, name text, tier text DEFAULT 'membro', status text DEFAULT 'ativo');
CREATE TABLE public.member_permissions(user_id uuid, permissions text[]);
CREATE TABLE public.notifications(id uuid DEFAULT gen_random_uuid(), user_id uuid, message text, type text, icon text, link text);
CREATE FUNCTION public.is_diretoria() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND tier='diretoria') $$;
CREATE FUNCTION public.has_permission(perm text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.member_permissions WHERE user_id=auth.uid() AND perm=ANY(permissions)) OR public.is_diretoria() $$;
CREATE TABLE public.events(id uuid PRIMARY KEY, title text, event_date date, status text, is_private boolean DEFAULT false);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY; CREATE POLICY ev_sel ON public.events FOR SELECT USING (is_private = false);
CREATE TABLE public.event_presencas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL, membro_id uuid NOT NULL, user_id uuid, status text NOT NULL,
  justif text, marcado_por uuid, justificativa text, response_status text, response_at timestamptz, justificativa_status text,
  justificativa_reviewed_by uuid, justificativa_reviewed_at timestamptz, justificativa_review_note text,
  attendance_status text, attendance_recorded_by uuid, attendance_recorded_at timestamptz);
-- Policies como em produção: o membro pode mexer na própria linha inteira.
ALTER TABLE public.event_presencas ENABLE ROW LEVEL SECURITY;
CREATE POLICY sel ON public.event_presencas FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY ins ON public.event_presencas FOR INSERT WITH CHECK (user_id = auth.uid() OR public.has_permission('gerenciar_presencas'));
CREATE POLICY upd ON public.event_presencas FOR UPDATE USING (user_id = auth.uid() OR membro_id = auth.uid() OR public.has_permission('gerenciar_presencas')) WITH CHECK (user_id = auth.uid() OR public.has_permission('gerenciar_presencas'));
CREATE POLICY del ON public.event_presencas FOR DELETE USING (public.is_diretoria() OR membro_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_presencas TO authenticated;
GRANT SELECT ON public.events, public.profiles, public.member_permissions TO authenticated;
-- notify_member como estava: qualquer um notifica todos.
CREATE FUNCTION public.notify_member(p_user_id uuid, p_message text, p_type text DEFAULT 'info', p_icon text DEFAULT '🔔', p_link text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ begin
  if p_user_id is null then insert into public.notifications (user_id, message, type, icon, link) select id, p_message, p_type, p_icon, p_link from public.profiles where status = 'ativo';
  else insert into public.notifications (user_id, message, type, icon, link) values (p_user_id, p_message, p_type, p_icon, p_link); end if; end; $$;

INSERT INTO public.profiles VALUES ('00000000-0000-0000-0000-00000000000a','Membro','membro'), ('00000000-0000-0000-0000-00000000000b','Gestor','membro'), ('00000000-0000-0000-0000-00000000000c','Dir','diretoria'), ('00000000-0000-0000-0000-00000000000d','Com','membro');
INSERT INTO public.member_permissions VALUES ('00000000-0000-0000-0000-00000000000b', ARRAY['registrar_presencas_eventos','gerenciar_presencas']), ('00000000-0000-0000-0000-00000000000d', ARRAY['publicar_comunicados']);
INSERT INTO public.events VALUES ('10000000-0000-0000-0000-000000000001','Passado', current_date - 3, 'ativo', true), ('10000000-0000-0000-0000-000000000002','Futuro', current_date + 3, 'ativo', false);

\ir ../supabase/migrations/20261127_travas_presenca_e_notificacao.sql

CREATE FUNCTION pg_temp.deve_falhar(sql text, papel text, uid text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE format('SET LOCAL ROLE %I', papel); PERFORM set_config('request.jwt.claim.sub', uid, true);
    EXECUTE sql; RESET ROLE;
    RAISE EXCEPTION 'devia ter falhado: %', sql USING errcode = 'P0009';
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; END;
END $$;

\set M '''00000000-0000-0000-0000-00000000000a'''
\set PASS '''10000000-0000-0000-0000-000000000001'''
\set FUT '''10000000-0000-0000-0000-000000000002'''

BEGIN;
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
-- Membro responde que vai ao evento futuro, muda para não vou com justificativa e volta: tudo pode (fluxos do portal).
INSERT INTO public.event_presencas(event_id, membro_id, user_id, status, response_status) VALUES (:FUT, :M, :M, 'confirmado', 'participar');
UPDATE public.event_presencas SET status='justificado', response_status='nao_participar', justificativa='Prova', justificativa_status='pendente' WHERE event_id=:FUT AND membro_id=:M;
UPDATE public.event_presencas SET status='confirmado', response_status='participar' WHERE event_id=:FUT AND membro_id=:M;
-- Justificativa de falta num evento que passou, sem presença registrada: pode.
INSERT INTO public.event_presencas(event_id, membro_id, user_id, status, response_status, justificativa, justificativa_status) VALUES (:PASS, :M, :M, 'justificado', 'nao_participar', 'Doente', 'pendente');
RESET ROLE;
COMMIT;

-- O que o membro NÃO pode mais.
SELECT pg_temp.deve_falhar($$UPDATE public.event_presencas SET attendance_status='presente' WHERE membro_id='00000000-0000-0000-0000-00000000000a' AND event_id='10000000-0000-0000-0000-000000000001'$$, 'authenticated', '00000000-0000-0000-0000-00000000000a');
SELECT pg_temp.deve_falhar($$UPDATE public.event_presencas SET justificativa_status='aceita' WHERE membro_id='00000000-0000-0000-0000-00000000000a' AND event_id='10000000-0000-0000-0000-000000000001'$$, 'authenticated', '00000000-0000-0000-0000-00000000000a');
SELECT pg_temp.deve_falhar($$UPDATE public.event_presencas SET status='confirmado', response_status='participar' WHERE membro_id='00000000-0000-0000-0000-00000000000a' AND event_id='10000000-0000-0000-0000-000000000001'$$, 'authenticated', '00000000-0000-0000-0000-00000000000a');
SELECT pg_temp.deve_falhar($$INSERT INTO public.event_presencas(event_id, membro_id, user_id, status, attendance_status) VALUES ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a','confirmado','presente')$$, 'authenticated', '00000000-0000-0000-0000-00000000000a');
SELECT pg_temp.deve_falhar($$INSERT INTO public.event_presencas(event_id, membro_id, user_id, status) VALUES ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000a','confirmado')$$, 'authenticated', '00000000-0000-0000-0000-00000000000a');

-- Gestor registra presença e a diretoria revisa: segue igual.
BEGIN;
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
UPDATE public.event_presencas SET status='ausente', attendance_status='ausente', attendance_recorded_by='00000000-0000-0000-0000-00000000000b', attendance_recorded_at=now() WHERE membro_id=:M AND event_id=:PASS;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
UPDATE public.event_presencas SET justificativa_status='recusada', justificativa_reviewed_by='00000000-0000-0000-0000-00000000000c', justificativa_reviewed_at=now() WHERE membro_id=:M AND event_id=:PASS;
RESET ROLE;
COMMIT;
DO $$ BEGIN IF (SELECT attendance_status FROM public.event_presencas WHERE event_id='10000000-0000-0000-0000-000000000001') <> 'ausente' THEN RAISE EXCEPTION 'gestor não gravou'; END IF; END $$;

-- Com falta registrada e justificativa recusada, o membro não apaga nem reabre.
SELECT pg_temp.deve_falhar($$DELETE FROM public.event_presencas WHERE membro_id='00000000-0000-0000-0000-00000000000a' AND event_id='10000000-0000-0000-0000-000000000001'$$, 'authenticated', '00000000-0000-0000-0000-00000000000a');
SELECT pg_temp.deve_falhar($$UPDATE public.event_presencas SET justificativa_status='pendente', status='justificado' WHERE membro_id='00000000-0000-0000-0000-00000000000a' AND event_id='10000000-0000-0000-0000-000000000001'$$, 'authenticated', '00000000-0000-0000-0000-00000000000a');
-- Mas apaga a própria resposta num evento futuro sem presença registrada.
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
DELETE FROM public.event_presencas WHERE event_id=:FUT AND membro_id=:M; RESET ROLE; COMMIT;

-- Notificações.
SELECT pg_temp.deve_falhar($$SELECT public.notify_member(null, 'spam')$$, 'authenticated', '00000000-0000-0000-0000-00000000000a');
SELECT pg_temp.deve_falhar($$SELECT public.notify_member(null, 'spam')$$, 'anon', '');
SELECT pg_temp.deve_falhar($$SELECT public.notify_member('00000000-0000-0000-0000-00000000000a', 'oi')$$, 'anon', '');
BEGIN; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
SELECT public.notify_member('00000000-0000-0000-0000-00000000000b', 'curtiu seu post'); -- membro para um membro: segue
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
SELECT public.notify_member(null, 'Novo comunicado'); -- quem publica comunicado: segue
RESET ROLE; COMMIT;
DO $$ BEGIN IF (SELECT count(*) FROM public.notifications WHERE message = 'Novo comunicado') <> 4 THEN RAISE EXCEPTION 'broadcast não chegou a todos'; END IF;
  IF (SELECT count(*) FROM public.notifications WHERE message = 'spam') <> 0 THEN RAISE EXCEPTION 'spam passou'; END IF; END $$;
SELECT 'OK: travas de presença e notificação' AS resultado;
