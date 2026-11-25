-- ============================================================
-- 20261126_agente_whatsapp_politica.sql   (RASCUNHO, Fase 0 do Agente MSY)
--
-- Decisão do Tales (25/11): o agente envia direto pelo Corvus, sem clique de
-- aprovação. Os freios ficam no servidor do portal, onde o modelo não mexe:
--
-- 1. agent_sessions: marca as sessões criadas para o agente (conectar-agente.html
--    e o /conectar do msy-agente). Serve para a ponte saber que o envio veio do
--    agente (via = 'agente') e para o agente não editar a própria política nem a
--    lista de quem usa o bot.
-- 2. bot_send_policy: o que cada pessoa pode pelo agente (grupos, privado, disparo,
--    controlar o Corvus). Sem cota diária e sem horário (Tales, 25/11).
--    Só a diretoria edita, fora do agente.
--    Liberação total por enquanto: Tales, Xitter, Mariana e Hariany (bloco 6).
-- 3. agent_audit: tudo que o agente escreve no portal.
-- 4. bot_messages ganha via / app.
--
-- Nada aqui muda o envio feito à mão na Central do Bot (bot.html).
-- Aplicar no SQL Editor do Supabase. Idempotente.
-- ============================================================

-- ── 1. Sessões do agente ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_sessions (
  session_id uuid PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  app        text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_sessions_select ON public.agent_sessions;
CREATE POLICY agent_sessions_select ON public.agent_sessions FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_diretoria());
-- Sem INSERT/UPDATE/DELETE direto: só pela função abaixo.

-- A sessão registra a SI MESMA (lê o session_id do próprio JWT), então ninguém
-- marca a sessão de outra pessoa nem desmarca a própria.
CREATE OR REPLACE FUNCTION public.register_agent_session(p_app text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE sid uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
BEGIN
  IF auth.uid() IS NULL OR sid IS NULL THEN
    RAISE EXCEPTION 'sem sessão';
  END IF;
  INSERT INTO public.agent_sessions (session_id, user_id, app)
  VALUES (sid, auth.uid(), left(p_app, 60))
  ON CONFLICT (session_id) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.register_agent_session(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.register_agent_session(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_agent_session()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agent_sessions
    WHERE session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_agent_session() TO authenticated;

-- ── 2. Política de envio ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bot_send_policy (
  user_id            uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  pode_privado       boolean NOT NULL DEFAULT true,
  grupos             text[],                       -- null = todos os grupos ativos; '{}' = nenhum
  pode_disparo       boolean NOT NULL DEFAULT false, -- vários membros de uma vez (fase 3)
  controla_corvus    boolean NOT NULL DEFAULT false, -- ligar/desligar o Corvus num grupo pelo agente
  updated_at         timestamptz DEFAULT now(),
  updated_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
ALTER TABLE public.bot_send_policy ADD COLUMN IF NOT EXISTS controla_corvus boolean NOT NULL DEFAULT false;
ALTER TABLE public.bot_send_policy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bot_send_policy_select ON public.bot_send_policy;
CREATE POLICY bot_send_policy_select ON public.bot_send_policy FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_diretoria());

-- Só a diretoria escreve, e nunca de uma sessão do agente.
DROP POLICY IF EXISTS bot_send_policy_write ON public.bot_send_policy;
CREATE POLICY bot_send_policy_write ON public.bot_send_policy FOR ALL TO authenticated
USING (public.is_diretoria() AND NOT public.is_agent_session())
WITH CHECK (public.is_diretoria() AND NOT public.is_agent_session());

-- ── 3. Auditoria do agente ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_audit (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tool       text NOT NULL,
  target     text,
  detail     jsonb,
  ok         boolean NOT NULL DEFAULT true,
  app        text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_audit_user_idx ON public.agent_audit (user_id, created_at DESC);
ALTER TABLE public.agent_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_audit_select ON public.agent_audit;
CREATE POLICY agent_audit_select ON public.agent_audit FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_diretoria());

DROP POLICY IF EXISTS agent_audit_insert ON public.agent_audit;
CREATE POLICY agent_audit_insert ON public.agent_audit FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());
-- Sem UPDATE/DELETE: o registro não se apaga pelo agente.

-- ── 4. Histórico do bot ─────────────────────────────────────
ALTER TABLE public.bot_messages ADD COLUMN IF NOT EXISTS via text NOT NULL DEFAULT 'portal'
  CHECK (via IN ('portal', 'agente', 'automacao'));
ALTER TABLE public.bot_messages ADD COLUMN IF NOT EXISTS app text;

-- ── 5. Brecha encontrada na revisão ─────────────────────────
-- bot_settings_update deixa QUALQUER pessoa liberada no bot editar a lista
-- allowed_senders (inclusive se liberar a outros). Passa a ser só diretoria,
-- fora de sessão do agente.
DROP POLICY IF EXISTS "bot_settings_update" ON public.bot_settings;
CREATE POLICY "bot_settings_update" ON public.bot_settings FOR UPDATE
USING (public.is_diretoria() AND NOT public.is_agent_session())
WITH CHECK (public.is_diretoria() AND NOT public.is_agent_session());

-- ── 6. Liberação total (decisão do Tales, 25/11) ────────────
-- Tales, Xitter, Mariana e Hariany: todos os grupos, privado, disparo,
-- controlar o Corvus. O registro de tudo que sai continua.
-- Procura pelo display_name; só grava quando o nome bate com UMA pessoa.
-- Confira o resultado nas mensagens (NOTICE) e ajuste à mão se faltar alguém.
DO $$
DECLARE n text; ids uuid[];
BEGIN
  FOREACH n IN ARRAY ARRAY['Tales', 'Xitter', 'Mariana', 'Hariany'] LOOP
    SELECT array_agg(id) INTO ids FROM public.profiles WHERE display_name ILIKE n || '%';
    IF coalesce(array_length(ids, 1), 0) <> 1 THEN
      RAISE NOTICE 'Liberação total: "%" achou % pessoas; preencha à mão.', n, coalesce(array_length(ids, 1), 0);
      CONTINUE;
    END IF;
    INSERT INTO public.bot_send_policy (user_id, pode_privado, grupos, pode_disparo, controla_corvus)
    VALUES (ids[1], true, NULL, true, true)
    ON CONFLICT (user_id) DO UPDATE SET pode_privado = true, grupos = NULL, pode_disparo = true, controla_corvus = true, updated_at = now();
    RAISE NOTICE 'Liberação total: "%" ok.', n;
  END LOOP;
END $$;
