-- ============================================================
-- MSY PORTAL — Jornal: Edições (leitura página por página)
-- Uma edição é um jornal_posts com post_type = 'edition' e section = 'edicoes'.
--   • tudo fica em content_blocks: [{ type:'edition', number, kind, format:'quadros' },
--     { type:'quadro', quadro, title, items:[imagens das páginas / textos] }, ...]
--   • (formato antigo, ainda lido pelo portal: páginas em jornal_media + toc)
--   Detalhes em JORNAL.md.
-- Curtidas, comentários, "quem viu", RLS e limpeza do R2 continuam os mesmos do Jornal.
-- Execute no Supabase Dashboard > SQL Editor.
-- ============================================================

-- Troca os CHECK de post_type e section (o nome pode variar, então procura pela definição).
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.jornal_posts'::regclass
      AND contype = 'c'
      AND (pg_get_constraintdef(oid) ILIKE '%post_type%' OR pg_get_constraintdef(oid) ILIKE '%section%')
  LOOP
    EXECUTE format('ALTER TABLE public.jornal_posts DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.jornal_posts
  ADD CONSTRAINT jornal_posts_post_type_check
  CHECK (post_type IN ('video','article','gallery','tirinha','special','edition'));

ALTER TABLE public.jornal_posts
  ADD CONSTRAINT jornal_posts_section_check
  CHECK (section IN ('principal','videos','tirinha','especiais','arquivo','edicoes'));

-- Conferência: deve listar as duas constraints novas.
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.jornal_posts'::regclass AND contype = 'c';
