-- ============================================================
-- MSY Portal — Migration: Presença em Eventos + Reuniões
-- ============================================================

-- 1) Ajustar event_presencas: adicionar coluna user_id e justificativa
--    (mantém compatibilidade com membro_id existente)
ALTER TABLE event_presencas
  ADD COLUMN IF NOT EXISTS user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS justificativa  TEXT;

-- Migrar membro_id -> user_id onde user_id for NULL
UPDATE event_presencas SET user_id = membro_id WHERE user_id IS NULL AND membro_id IS NOT NULL;

-- Status aceitos: participar, nao_participar, confirmado, ausente, justificado
-- Unique constraint por evento+usuário
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'event_presencas_user_event_unique'
  ) THEN
    ALTER TABLE event_presencas
      ADD CONSTRAINT event_presencas_user_event_unique UNIQUE (event_id, user_id);
  END IF;
END$$;

-- 2) Tabela event_cancel_requests
CREATE TABLE IF NOT EXISTS event_cancel_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  justificativa TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovado','recusado')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cancel_requests_user    ON event_cancel_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_cancel_requests_event   ON event_cancel_requests(event_id);
CREATE INDEX IF NOT EXISTS idx_cancel_requests_status  ON event_cancel_requests(status);

-- 3) Tabela meetings (reuniões oficiais)
CREATE TABLE IF NOT EXISTS meetings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  meeting_date  DATE NOT NULL,
  meeting_time  TIME,
  type          TEXT NOT NULL DEFAULT 'geral' CHECK (type IN ('geral','diretoria')),
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'agendada' CHECK (status IN ('agendada','realizada','cancelada')),
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meetings_date    ON meetings(meeting_date);
CREATE INDEX IF NOT EXISTS idx_meetings_type    ON meetings(type);
CREATE INDEX IF NOT EXISTS idx_meetings_status  ON meetings(status);

-- 4) Tabela meeting_requests (solicitações de call)
CREATE TABLE IF NOT EXISTS meeting_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  motivo        TEXT NOT NULL,
  descricao     TEXT,
  data_sugerida TEXT,
  status        TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovado','recusado')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meeting_requests_user    ON meeting_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_meeting_requests_status  ON meeting_requests(status);

-- ============================================================
-- RLS Policies
-- ============================================================

-- event_presencas: members see/insert own rows; diretoria sees all
ALTER TABLE event_presencas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ep_member_select ON event_presencas;
CREATE POLICY ep_member_select ON event_presencas FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND tier = 'diretoria'
    )
  );

DROP POLICY IF EXISTS ep_member_insert ON event_presencas;
CREATE POLICY ep_member_insert ON event_presencas FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS ep_member_update ON event_presencas;
CREATE POLICY ep_member_update ON event_presencas FOR UPDATE
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND tier = 'diretoria'));

DROP POLICY IF EXISTS ep_diretoria_delete ON event_presencas;
CREATE POLICY ep_diretoria_delete ON event_presencas FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND tier = 'diretoria'));

-- event_cancel_requests
ALTER TABLE event_cancel_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ecr_member_insert ON event_cancel_requests;
CREATE POLICY ecr_member_insert ON event_cancel_requests FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS ecr_member_select ON event_cancel_requests;
CREATE POLICY ecr_member_select ON event_cancel_requests FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND tier = 'diretoria')
  );

DROP POLICY IF EXISTS ecr_diretoria_update ON event_cancel_requests;
CREATE POLICY ecr_diretoria_update ON event_cancel_requests FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND tier = 'diretoria'));

-- meetings
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meet_select ON meetings;
CREATE POLICY meet_select ON meetings FOR SELECT
  USING (
    type = 'geral'
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND tier = 'diretoria')
  );

DROP POLICY IF EXISTS meet_diretoria_all ON meetings;
CREATE POLICY meet_diretoria_all ON meetings FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND tier = 'diretoria'));

-- meeting_requests
ALTER TABLE meeting_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mr_member_insert ON meeting_requests;
CREATE POLICY mr_member_insert ON meeting_requests FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS mr_select ON meeting_requests;
CREATE POLICY mr_select ON meeting_requests FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND tier = 'diretoria')
  );

DROP POLICY IF EXISTS mr_diretoria_update ON meeting_requests;
CREATE POLICY mr_diretoria_update ON meeting_requests FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND tier = 'diretoria'));
