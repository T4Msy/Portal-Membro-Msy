-- ============================================================
-- MSY PORTAL — MIGRATION GESTÃO DE PROJETOS
-- Centraliza criação, documentação, participantes, categorias,
-- tarefas, checklist, progresso, histórico e notificações de projetos.
-- Execute no Supabase Dashboard > SQL Editor.
-- ============================================================

-- ============================================================
-- 1. TABELAS
-- ============================================================

-- ── projects: dados gerais + planejamento + datas ─────────
CREATE TABLE IF NOT EXISTS public.projects (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by              uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  name                    text NOT NULL,
  description             text,
  objetivo                text,
  problema                text,
  publico_alvo            text,
  tipo                    text NOT NULL DEFAULT 'interno'
                            CHECK (tipo IN ('interno','externo')),
  funcionalidades_previstas text,
  beneficios_esperados    text,
  criterios_sucesso       text,
  roadmap                 jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{versao:'V1', descricao:'...'}]
  prioridade              text NOT NULL DEFAULT 'media'
                            CHECK (prioridade IN ('baixa','media','alta','critica')),
  status                  text NOT NULL DEFAULT 'planejamento'
                            CHECK (status IN ('planejamento','em_desenvolvimento','em_testes','homologacao','concluido','cancelado')),
  data_inicio             date,
  data_entrega            date,
  responsavel_id          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- ── project_participants: membros do projeto + papéis ─────
CREATE TABLE IF NOT EXISTS public.project_participants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  roles         text[] NOT NULL DEFAULT ARRAY[]::text[],  -- Front-end, Back-end, UX/UI, QA, Gestor, ...
  is_manager    boolean NOT NULL DEFAULT false,
  joined_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

-- ── project_role_options: catálogo de papéis personalizados ─
CREATE TABLE IF NOT EXISTS public.project_role_options (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text UNIQUE NOT NULL,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── project_categories: categorias de trabalho do projeto ──
CREATE TABLE IF NOT EXISTS public.project_categories (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name         text NOT NULL,
  color        text DEFAULT '#c9a84c',
  icon         text DEFAULT 'fa-folder',
  order_index  integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── project_tasks: tarefas ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  category_id  uuid REFERENCES public.project_categories(id) ON DELETE SET NULL,
  title        text NOT NULL,
  description  text,
  assigned_to  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  prioridade   text NOT NULL DEFAULT 'media'
                 CHECK (prioridade IN ('baixa','media','alta','critica')),
  status       text NOT NULL DEFAULT 'nao_iniciada'
                 CHECK (status IN ('nao_iniciada','em_andamento','em_revisao','concluida','bloqueada')),
  prazo        date,
  observacoes  text,
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ── task_checklist_items: checklist de cada tarefa ────────
CREATE TABLE IF NOT EXISTS public.task_checklist_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      uuid NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  text         text NOT NULL,
  done         boolean NOT NULL DEFAULT false,
  order_index  integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── project_docs: wiki interna (uma linha por seção) ──────
CREATE TABLE IF NOT EXISTS public.project_docs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  section_key  text NOT NULL
                 CHECK (section_key IN ('contexto','objetivos','requisitos','regras_negocio','arquitetura','decisoes_tecnicas','roadmap','observacoes')),
  content      text,
  updated_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, section_key)
);

-- ── project_history: timeline de eventos ──────────────────
CREATE TABLE IF NOT EXISTS public.project_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  actor_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action       text NOT NULL,           -- projeto_criado, participante_adicionado, tarefa_criada, ...
  target_type  text,                    -- project | task | participant | category | doc
  target_id    uuid,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_projects_status        ON public.projects(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_responsavel   ON public.projects(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_pp_project             ON public.project_participants(project_id);
CREATE INDEX IF NOT EXISTS idx_pp_user                ON public.project_participants(user_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS idx_pcat_project           ON public.project_categories(project_id, order_index);
CREATE INDEX IF NOT EXISTS idx_ptasks_project         ON public.project_tasks(project_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ptasks_assigned        ON public.project_tasks(assigned_to, status, prazo);
CREATE INDEX IF NOT EXISTS idx_ptasks_category        ON public.project_tasks(category_id);
CREATE INDEX IF NOT EXISTS idx_checklist_task         ON public.task_checklist_items(task_id, order_index);
CREATE INDEX IF NOT EXISTS idx_pdocs_project          ON public.project_docs(project_id);
CREATE INDEX IF NOT EXISTS idx_phistory_project       ON public.project_history(project_id, created_at DESC);

-- ============================================================
-- 3. FUNÇÕES HELPER (espelham is_diretoria / has_permission)
-- ============================================================

-- Membro do projeto (ou diretoria) — usado em SELECT
CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_diretoria()
    OR EXISTS (
      SELECT 1 FROM public.project_participants pp
      WHERE pp.project_id = p_project_id
        AND pp.user_id = auth.uid()
    )
    OR EXISTS (
      -- criador/responsável sempre enxergam o projeto (mesmo antes de virar participante)
      SELECT 1 FROM public.projects p
      WHERE p.id = p_project_id
        AND (p.created_by = auth.uid() OR p.responsavel_id = auth.uid())
    );
$$;

-- Pode gerenciar o projeto — usado em INSERT/UPDATE/DELETE
CREATE OR REPLACE FUNCTION public.can_manage_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_diretoria()
    OR public.has_permission('gerenciar_projetos')
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = p_project_id
        AND (p.created_by = auth.uid() OR p.responsavel_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.project_participants pp
      WHERE pp.project_id = p_project_id
        AND pp.user_id = auth.uid()
        AND pp.is_manager = true
    );
$$;

-- ============================================================
-- 4. RPCs
-- ============================================================

-- Notifica vários membros sobre um evento do projeto.
-- SECURITY DEFINER contorna o RLS de INSERT em notifications,
-- mas exige que o caller participe/gerencie o projeto.
CREATE OR REPLACE FUNCTION public.notify_project(
  p_project_id uuid,
  p_user_ids   uuid[],
  p_message    text,
  p_type       text DEFAULT 'projeto',
  p_icon       text DEFAULT '📁',
  p_link       text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_uid   uuid;
  v_count integer := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.';
  END IF;
  IF NOT public.is_project_member(p_project_id) THEN
    RAISE EXCEPTION 'Sem acesso a este projeto.';
  END IF;

  FOREACH v_uid IN ARRAY COALESCE(p_user_ids, ARRAY[]::uuid[])
  LOOP
    -- não notifica a si mesmo
    CONTINUE WHEN v_uid IS NULL OR v_uid = v_actor;

    INSERT INTO public.notifications (
      user_id, actor_id, message, type, icon, link,
      target_type, target_id, target_url, metadata
    )
    VALUES (
      v_uid, v_actor, p_message, p_type, p_icon, p_link,
      'project', p_project_id, p_link, jsonb_build_object('project_id', p_project_id)
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_project(uuid, uuid[], text, text, text, text) TO authenticated;

-- ============================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================

-- ── projects ──────────────────────────────────────────────
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros leem projetos que participam" ON public.projects;
CREATE POLICY "Membros leem projetos que participam"
  ON public.projects FOR SELECT
  USING (public.is_project_member(id));

DROP POLICY IF EXISTS "Gestor/perm cria projetos" ON public.projects;
CREATE POLICY "Gestor/perm cria projetos"
  ON public.projects FOR INSERT
  WITH CHECK (
    public.has_permission('criar_projetos')
    OR public.has_permission('gerenciar_projetos')
  );

DROP POLICY IF EXISTS "Gestor edita projetos" ON public.projects;
CREATE POLICY "Gestor edita projetos"
  ON public.projects FOR UPDATE
  USING (public.can_manage_project(id))
  WITH CHECK (public.can_manage_project(id));

DROP POLICY IF EXISTS "Gestor remove projetos" ON public.projects;
CREATE POLICY "Gestor remove projetos"
  ON public.projects FOR DELETE
  USING (public.can_manage_project(id));

-- ── project_participants ──────────────────────────────────
ALTER TABLE public.project_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros leem participantes" ON public.project_participants;
CREATE POLICY "Membros leem participantes"
  ON public.project_participants FOR SELECT
  USING (public.is_project_member(project_id));

DROP POLICY IF EXISTS "Gestor gerencia participantes" ON public.project_participants;
CREATE POLICY "Gestor gerencia participantes"
  ON public.project_participants FOR ALL
  USING (public.can_manage_project(project_id))
  WITH CHECK (public.can_manage_project(project_id));

-- ── project_role_options ──────────────────────────────────
ALTER TABLE public.project_role_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Todos autenticados leem papéis" ON public.project_role_options;
CREATE POLICY "Todos autenticados leem papéis"
  ON public.project_role_options FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Gestor cria papéis" ON public.project_role_options;
CREATE POLICY "Gestor cria papéis"
  ON public.project_role_options FOR INSERT
  WITH CHECK (
    public.has_permission('criar_projetos')
    OR public.has_permission('gerenciar_projetos')
  );

-- ── project_categories ────────────────────────────────────
ALTER TABLE public.project_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros leem categorias" ON public.project_categories;
CREATE POLICY "Membros leem categorias"
  ON public.project_categories FOR SELECT
  USING (public.is_project_member(project_id));

DROP POLICY IF EXISTS "Gestor gerencia categorias" ON public.project_categories;
CREATE POLICY "Gestor gerencia categorias"
  ON public.project_categories FOR ALL
  USING (public.can_manage_project(project_id))
  WITH CHECK (public.can_manage_project(project_id));

-- ── project_tasks ─────────────────────────────────────────
ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros leem tarefas" ON public.project_tasks;
CREATE POLICY "Membros leem tarefas"
  ON public.project_tasks FOR SELECT
  USING (public.is_project_member(project_id));

DROP POLICY IF EXISTS "Gestor cria tarefas" ON public.project_tasks;
CREATE POLICY "Gestor cria tarefas"
  ON public.project_tasks FOR INSERT
  WITH CHECK (public.can_manage_project(project_id));

-- Gestor edita qualquer tarefa; responsável atualiza a própria
DROP POLICY IF EXISTS "Gestor ou responsável edita tarefa" ON public.project_tasks;
CREATE POLICY "Gestor ou responsável edita tarefa"
  ON public.project_tasks FOR UPDATE
  USING (public.can_manage_project(project_id) OR assigned_to = auth.uid())
  WITH CHECK (public.can_manage_project(project_id) OR assigned_to = auth.uid());

DROP POLICY IF EXISTS "Gestor remove tarefas" ON public.project_tasks;
CREATE POLICY "Gestor remove tarefas"
  ON public.project_tasks FOR DELETE
  USING (public.can_manage_project(project_id));

-- ── task_checklist_items ──────────────────────────────────
ALTER TABLE public.task_checklist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros leem checklist" ON public.task_checklist_items;
CREATE POLICY "Membros leem checklist"
  ON public.task_checklist_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.project_tasks t
    WHERE t.id = task_checklist_items.task_id
      AND public.is_project_member(t.project_id)
  ));

-- Gestor do projeto ou responsável da tarefa gerencia o checklist
DROP POLICY IF EXISTS "Gestor ou responsável gerencia checklist" ON public.task_checklist_items;
CREATE POLICY "Gestor ou responsável gerencia checklist"
  ON public.task_checklist_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.project_tasks t
    WHERE t.id = task_checklist_items.task_id
      AND (public.can_manage_project(t.project_id) OR t.assigned_to = auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.project_tasks t
    WHERE t.id = task_checklist_items.task_id
      AND (public.can_manage_project(t.project_id) OR t.assigned_to = auth.uid())
  ));

-- ── project_docs ──────────────────────────────────────────
ALTER TABLE public.project_docs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros leem docs" ON public.project_docs;
CREATE POLICY "Membros leem docs"
  ON public.project_docs FOR SELECT
  USING (public.is_project_member(project_id));

DROP POLICY IF EXISTS "Gestor gerencia docs" ON public.project_docs;
CREATE POLICY "Gestor gerencia docs"
  ON public.project_docs FOR ALL
  USING (public.can_manage_project(project_id))
  WITH CHECK (public.can_manage_project(project_id));

-- ── project_history ───────────────────────────────────────
ALTER TABLE public.project_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros leem histórico" ON public.project_history;
CREATE POLICY "Membros leem histórico"
  ON public.project_history FOR SELECT
  USING (public.is_project_member(project_id));

DROP POLICY IF EXISTS "Membros registram histórico" ON public.project_history;
CREATE POLICY "Membros registram histórico"
  ON public.project_history FOR INSERT
  WITH CHECK (public.is_project_member(project_id) AND actor_id = auth.uid());

-- ============================================================
-- 6. DOCUMENTAÇÃO
-- ============================================================
COMMENT ON TABLE public.projects IS 'Projetos da MSY: dados gerais, planejamento, roadmap, status e datas.';
COMMENT ON TABLE public.project_participants IS 'Participantes do projeto com papéis (roles[]) e flag de gestor.';
COMMENT ON TABLE public.project_role_options IS 'Catálogo de papéis personalizados reutilizáveis entre projetos.';
COMMENT ON TABLE public.project_categories IS 'Categorias de trabalho dentro de um projeto.';
COMMENT ON TABLE public.project_tasks IS 'Tarefas do projeto, vinculadas a categorias e responsáveis.';
COMMENT ON TABLE public.task_checklist_items IS 'Itens de checklist de cada tarefa (base do progresso da tarefa).';
COMMENT ON TABLE public.project_docs IS 'Wiki interna do projeto: uma linha por seção de documentação.';
COMMENT ON TABLE public.project_history IS 'Timeline de eventos do projeto (auditoria/histórico).';
