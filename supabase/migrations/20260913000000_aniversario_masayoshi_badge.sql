-- Insígnia comemorativa: Aniversário da Masayoshi — 5 anos.
-- Localiza o evento pelo texto central do título, permitindo emojis ao redor.
-- A concessão considera somente presença real: attendance_status = presente
-- ou o status legado confirmado. Respostas de intenção não são suficientes.

DO $$
DECLARE
  badge_id uuid;
  matching_event_id uuid;
  event_creator_id uuid;
  matching_events integer;
BEGIN
  SELECT count(*)
    INTO matching_events
  FROM public.events
  WHERE title ILIKE '%ANIVERSÁRIO DA MASAYOSHI%';

  IF matching_events <> 1 THEN
    RAISE EXCEPTION 'Esperado exatamente um evento cujo título contenha "ANIVERSÁRIO DA MASAYOSHI"; encontrados %.', matching_events;
  END IF;

  SELECT id, created_by
    INTO matching_event_id, event_creator_id
  FROM public.events
  WHERE title ILIKE '%ANIVERSÁRIO DA MASAYOSHI%';

  SELECT id
    INTO badge_id
  FROM public.premiacoes
  WHERE titulo = 'Aniversário da Masayoshi — 5 anos'
  ORDER BY created_at
  LIMIT 1;

  IF badge_id IS NULL THEN
    INSERT INTO public.premiacoes (
      titulo,
      descricao,
      importancia,
      icone,
      imagem_url,
      ativo,
      criado_por
    )
    VALUES (
      'Aniversário da Masayoshi — 5 anos',
      'Concedida aos membros com presença real registrada no evento Aniversário da Masayoshi, em celebração aos cinco anos da Ordem e à construção coletiva de sua história.',
      'Especial',
      '🦅',
      '/icons/badges/aniversario-masayoshi-5-anos.webp',
      true,
      event_creator_id
    )
    RETURNING id INTO badge_id;
  END IF;

  INSERT INTO public.premiacao_vencedores (
    premiacao_id,
    membro_id,
    periodo,
    observacao,
    concedido_por
  )
  SELECT DISTINCT
    badge_id,
    COALESCE(presenca.user_id, presenca.membro_id),
    'Aniversário da Masayoshi — 5 anos',
    'Presença real registrada no evento comemorativo de 5 anos da Masayoshi.',
    event_creator_id
  FROM public.event_presencas AS presenca
  WHERE presenca.event_id = matching_event_id
    AND COALESCE(presenca.user_id, presenca.membro_id) IS NOT NULL
    AND (presenca.attendance_status = 'presente' OR presenca.status = 'confirmado')
    AND NOT EXISTS (
      SELECT 1
      FROM public.premiacao_vencedores AS vencedor
      WHERE vencedor.premiacao_id = badge_id
        AND vencedor.membro_id = COALESCE(presenca.user_id, presenca.membro_id)
        AND vencedor.periodo = 'Aniversário da Masayoshi — 5 anos'
    );
END;
$$;
