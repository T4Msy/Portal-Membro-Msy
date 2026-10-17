-- Atividades: novo status 'Incompleta' = "Concluída (incompleta)".
-- A atividade foi encerrada, mas sem entregar tudo. No desempenho vale MEIA atividade concluída
-- (decisão do dono, 17/10/2026).
--
-- As funções do banco não estão no repositório; por isso a troca é feita lendo a definição atual
-- e substituindo só o trecho exato. Se o trecho não existir, a migration para com erro.

ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_status_check;
ALTER TABLE public.activities ADD CONSTRAINT activities_status_check
  CHECK (status = ANY (ARRAY['Pendente', 'Em andamento', 'Concluída', 'Incompleta', 'Cancelada']));

DO $mig$
DECLARE
  fn oid;
  def text;
  novo text;
BEGIN
  -- 1) Desempenho: taxa de conclusão conta incompleta como meia.
  SELECT p.oid INTO fn FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_desempenho_membros';
  def := pg_get_functiondef(fn);
  IF position('Incompleta' IN def) = 0 THEN
    novo := replace(def,
      $a$count(a.id) filter (where a.status = 'Concluída') * 100.0$a$,
      $b$(count(a.id) filter (where a.status = 'Concluída') + 0.5 * count(a.id) filter (where a.status = 'Incompleta')) * 100.0$b$);
    IF novo = def THEN RAISE EXCEPTION 'get_desempenho_membros: trecho da taxa não encontrado'; END IF;
    EXECUTE novo;
  END IF;

  -- 2) Estatísticas do membro: novo campo 'incompletas'.
  SELECT p.oid INTO fn FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_member_stats';
  def := pg_get_functiondef(fn);
  IF position('Incompleta' IN def) = 0 THEN
    novo := replace(def,
      $a$'concluidas',  count(*) filter (where status = 'Concluída')$a$,
      $b$'concluidas',  count(*) filter (where status = 'Concluída'),
    'incompletas', count(*) filter (where status = 'Incompleta')$b$);
    IF novo = def THEN RAISE EXCEPTION 'get_member_stats: trecho de concluidas não encontrado'; END IF;
    EXECUTE novo;
  END IF;

  -- 3) Linha do tempo da Supervisão: incompleta também é "atividade concluída".
  SELECT p.oid INTO fn FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'supervision_timeline_activity';
  def := pg_get_functiondef(fn);
  IF position('Incompleta' IN def) = 0 THEN
    novo := replace(def,
      $a$WHEN NEW.status = 'Concluída' THEN 'atividade_concluida'$a$,
      $b$WHEN NEW.status IN ('Concluída', 'Incompleta') THEN 'atividade_concluida'$b$);
    novo := replace(novo,
      $a$WHEN NEW.status = 'Concluída' THEN 'Atividade concluida: ' || NEW.title$a$,
      $b$WHEN NEW.status = 'Incompleta' THEN 'Atividade concluida (incompleta): ' || NEW.title WHEN NEW.status = 'Concluída' THEN 'Atividade concluida: ' || NEW.title$b$);
    IF position('Incompleta' IN novo) = 0 THEN RAISE EXCEPTION 'supervision_timeline_activity: trechos não encontrados'; END IF;
    EXECUTE novo;
  END IF;
END
$mig$;
