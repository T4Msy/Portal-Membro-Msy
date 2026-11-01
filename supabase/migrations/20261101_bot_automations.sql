-- ============================================================
-- Avisos automáticos do Bot Corvus (Fase 2)
-- - bot_automations: cada aviso que o bot manda sozinho (liga/desliga,
--   grupo/privado, antecedência e texto editável na Central do Bot)
-- - bot_auto_log: o que já foi enviado (o mesmo aviso nunca sai duas vezes)
-- - bot_messages.source: de qual automação veio a mensagem (null = manual)
-- Quem lê e envia é o bot (servidor), com a chave secreta do Supabase.
-- Aplicar no Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bot_automations (
  key            text PRIMARY KEY,
  sort           smallint NOT NULL DEFAULT 0,
  category       text NOT NULL,           -- Eventos, Atividades, Reuniões, Comunicados
  label          text NOT NULL,
  description    text,
  enabled        boolean NOT NULL DEFAULT true,
  to_group       boolean NOT NULL DEFAULT true,
  to_private     boolean NOT NULL DEFAULT false,
  offset_minutes integer,                 -- antecedência (null = na hora do fato)
  template       text NOT NULL,
  updated_at     timestamptz DEFAULT now(),
  updated_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.bot_automations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bot_automations_select" ON public.bot_automations;
DROP POLICY IF EXISTS "bot_automations_update" ON public.bot_automations;

CREATE POLICY "bot_automations_select" ON public.bot_automations FOR SELECT
USING (public.is_bot_sender());

CREATE POLICY "bot_automations_update" ON public.bot_automations FOR UPDATE
USING (public.is_bot_sender())
WITH CHECK (public.is_bot_sender());

-- Textos iniciais. Variáveis: {titulo} {data} {hora} {descricao} {link}
-- {nome} {prazo} {pendentes} {pessoas} {categoria} {conteudo}
INSERT INTO public.bot_automations (key, sort, category, label, description, enabled, to_group, to_private, offset_minutes, template) VALUES
('evento_publicado', 10, 'Eventos', 'Evento publicado',
 'Quando um evento é adicionado ao portal.', true, true, false, NULL,
 E'📅 *Novo evento no Portal MSY!*\n\n*{titulo}*\n🗓️ {data} às {hora}\n\nAcessem o portal e marquem a presença: {link}'),
('evento_cobranca_1', 20, 'Eventos', 'Cobrança de presença (1ª)',
 'Cobra quem ainda não marcou presença (no grupo, marcando as pessoas, e no privado).', true, true, true, 1440,
 E'⚠️ *Falta marcar presença!*\n\n*{titulo}* — {data} às {hora}\n\n{pendentes}\n\nMarquem no portal: {link}'),
('evento_cobranca_2', 30, 'Eventos', 'Cobrança de presença (2ª)',
 'Segunda cobrança para quem continua sem marcar.', true, true, true, 180,
 E'⏳ *Última chamada para marcar presença!*\n\n*{titulo}* começa às {hora}.\n\n{pendentes}\n\nMarquem agora: {link}'),
('evento_1h', 40, 'Eventos', 'Falta 1 hora',
 'Lembrete no grupo 1 hora antes do evento.', true, true, false, 60,
 E'⏰ *Falta 1 hora!*\n\n*{titulo}* começa às {hora}.'),
('evento_30min', 50, 'Eventos', 'Faltam 30 minutos',
 'Lembrete no grupo 30 minutos antes do evento.', true, true, false, 30,
 E'⏰ *Faltam 30 minutos!*\n\n*{titulo}* começa às {hora}. Preparem-se!'),
('evento_inicio', 60, 'Eventos', 'Evento começou',
 'No horário do evento, marcando todos do grupo.', true, true, false, 0,
 E'🔴 *Começou!*\n\n*{titulo}* está começando agora.\n\n{todos}'),
('atividade_nova', 70, 'Atividades', 'Atividade nova',
 'Quando uma atividade é criada para alguém.', true, true, true, NULL,
 E'📋 *Nova atividade no Portal MSY*\n\n*{titulo}*\n👤 Para: {pessoas}\n⏰ Prazo: {prazo}\n\nAcesse: {link}'),
('atividade_prazo_dia', 80, 'Atividades', 'Prazo hoje',
 'Às 8h do dia do prazo, para quem ainda não entregou.', true, false, true, NULL,
 E'📌 *Hoje é o prazo!*\n\n*{titulo}* vence hoje às {hora}.\n\nEntregue pelo portal: {link}'),
('atividade_prazo_1h', 90, 'Atividades', 'Prazo em 1 hora',
 '1 hora antes do prazo, para quem ainda não entregou.', true, false, true, 60,
 E'⏳ *Falta 1 hora para o prazo!*\n\n*{titulo}* vence às {hora}.\n\nEntregue pelo portal: {link}'),
('reuniao_marcada', 100, 'Reuniões', 'Reunião marcada',
 'Quando uma reunião é agendada, para os convidados.', true, false, true, NULL,
 E'🤝 *Você foi convidado para uma reunião*\n\n*{titulo}*\n🗓️ {data} às {hora}\n\nDetalhes no portal: {link}'),
('reuniao_lembrete', 110, 'Reuniões', 'Lembrete da reunião',
 'Lembrete aos convidados antes da reunião.', true, false, true, 60,
 E'⏰ *Sua reunião começa em 1 hora*\n\n*{titulo}* às {hora}.'),
('comunicado_novo', 120, 'Comunicados', 'Comunicado novo',
 'Quando sai um comunicado no portal.', true, true, false, NULL,
 E'📢 *Novo comunicado — {categoria}*\n\n*{titulo}*\n\n{conteudo}\n\nLeia no portal: {link}')
ON CONFLICT (key) DO NOTHING;

-- ── Controle do que já foi enviado ─────────────────────────
CREATE TABLE IF NOT EXISTS public.bot_auto_log (
  key     text NOT NULL,
  ref_id  text NOT NULL,
  sent_at timestamptz DEFAULT now(),
  PRIMARY KEY (key, ref_id)
);

ALTER TABLE public.bot_auto_log ENABLE ROW LEVEL SECURITY;
-- Sem políticas: só o bot (chave secreta) lê e grava.

-- ── Origem das mensagens no histórico ──────────────────────
ALTER TABLE public.bot_messages ADD COLUMN IF NOT EXISTS source text;
