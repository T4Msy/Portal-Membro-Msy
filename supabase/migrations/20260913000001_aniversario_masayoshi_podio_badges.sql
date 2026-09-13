-- Insígnias do pódio do evento Aniversário da Masayoshi — 5 anos.
-- Concede uma insígnia especial para cada vencedor informado pela coordenação.
-- A migration é idempotente e interrompe se não encontrar exatamente um perfil por nome.

DO $$
DECLARE
  award_creator_id uuid;
  member_id uuid;
  member_count integer;
  award_id uuid;
BEGIN
  SELECT criado_por
    INTO award_creator_id
  FROM public.premiacoes
  WHERE titulo = 'Aniversário da Masayoshi — 5 anos'
  ORDER BY created_at
  LIMIT 1;

  SELECT count(*) INTO member_count
  FROM public.profiles
  WHERE lower(btrim(name)) = 'hariany';
  IF member_count <> 1 THEN
    RAISE EXCEPTION 'Esperado exatamente um perfil chamado Hariany; encontrados %.', member_count;
  END IF;
  SELECT id INTO member_id FROM public.profiles WHERE lower(btrim(name)) = 'hariany';

  SELECT id INTO award_id FROM public.premiacoes
  WHERE titulo = 'Aniversário da Masayoshi — 5 anos — 1º Lugar'
  ORDER BY created_at LIMIT 1;
  IF award_id IS NULL THEN
    INSERT INTO public.premiacoes (titulo, descricao, importancia, icone, imagem_url, ativo, criado_por)
    VALUES (
      'Aniversário da Masayoshi — 5 anos — 1º Lugar',
      'Insígnia máxima do pódio do evento Aniversário da Masayoshi — 5 anos. Reconhece a campeã Hariany pela conquista do primeiro lugar.',
      'Especial', '🥇', '/icons/badges/aniversario-masayoshi-5-anos-primeiro-lugar.svg', true, award_creator_id
    ) RETURNING id INTO award_id;
  END IF;
  INSERT INTO public.premiacao_vencedores (premiacao_id, membro_id, periodo, observacao, concedido_por)
  SELECT award_id, member_id, 'Aniversário da Masayoshi — 5 anos', '1º lugar no evento Aniversário da Masayoshi — 5 anos.', award_creator_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.premiacao_vencedores
    WHERE premiacao_id = award_id AND membro_id = member_id AND periodo = 'Aniversário da Masayoshi — 5 anos'
  );

  SELECT count(*) INTO member_count
  FROM public.profiles
  WHERE lower(btrim(name)) = 'pepeu';
  IF member_count <> 1 THEN
    RAISE EXCEPTION 'Esperado exatamente um perfil chamado Pepeu; encontrados %.', member_count;
  END IF;
  SELECT id INTO member_id FROM public.profiles WHERE lower(btrim(name)) = 'pepeu';

  SELECT id INTO award_id FROM public.premiacoes
  WHERE titulo = 'Aniversário da Masayoshi — 5 anos — 2º Lugar'
  ORDER BY created_at LIMIT 1;
  IF award_id IS NULL THEN
    INSERT INTO public.premiacoes (titulo, descricao, importancia, icone, imagem_url, ativo, criado_por)
    VALUES (
      'Aniversário da Masayoshi — 5 anos — 2º Lugar',
      'Insígnia de destaque do pódio do evento Aniversário da Masayoshi — 5 anos. Reconhece Pepeu pela conquista do segundo lugar.',
      'Especial', '🥈', '/icons/badges/aniversario-masayoshi-5-anos-segundo-lugar.svg', true, award_creator_id
    ) RETURNING id INTO award_id;
  END IF;
  INSERT INTO public.premiacao_vencedores (premiacao_id, membro_id, periodo, observacao, concedido_por)
  SELECT award_id, member_id, 'Aniversário da Masayoshi — 5 anos', '2º lugar no evento Aniversário da Masayoshi — 5 anos.', award_creator_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.premiacao_vencedores
    WHERE premiacao_id = award_id AND membro_id = member_id AND periodo = 'Aniversário da Masayoshi — 5 anos'
  );

  SELECT count(*) INTO member_count
  FROM public.profiles
  WHERE lower(translate(btrim(name), 'áàãâäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')) = 'joao pedro';
  IF member_count <> 1 THEN
    RAISE EXCEPTION 'Esperado exatamente um perfil chamado João Pedro; encontrados %.', member_count;
  END IF;
  SELECT id INTO member_id FROM public.profiles
  WHERE lower(translate(btrim(name), 'áàãâäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')) = 'joao pedro';

  SELECT id INTO award_id FROM public.premiacoes
  WHERE titulo = 'Aniversário da Masayoshi — 5 anos — 3º Lugar'
  ORDER BY created_at LIMIT 1;
  IF award_id IS NULL THEN
    INSERT INTO public.premiacoes (titulo, descricao, importancia, icone, imagem_url, ativo, criado_por)
    VALUES (
      'Aniversário da Masayoshi — 5 anos — 3º Lugar',
      'Insígnia de mérito do pódio do evento Aniversário da Masayoshi — 5 anos. Reconhece João pela conquista do terceiro lugar.',
      'Especial', '🥉', '/icons/badges/aniversario-masayoshi-5-anos-terceiro-lugar.svg', true, award_creator_id
    ) RETURNING id INTO award_id;
  END IF;
  INSERT INTO public.premiacao_vencedores (premiacao_id, membro_id, periodo, observacao, concedido_por)
  SELECT award_id, member_id, 'Aniversário da Masayoshi — 5 anos', '3º lugar no evento Aniversário da Masayoshi — 5 anos.', award_creator_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.premiacao_vencedores
    WHERE premiacao_id = award_id AND membro_id = member_id AND periodo = 'Aniversário da Masayoshi — 5 anos'
  );
END;
$$;
