# Jornal da Masayoshi

Documento de referência do Jornal no portal: para que ele serve, como funciona hoje, onde está o código e o que ainda falta. Leia antes de mexer em `jornal.html`, `js/pages/jornal*.js` ou `css/jornal.css`.

## Para que serve

O Jornal da Masayoshi é o projeto de comunicação e entretenimento da Ordem. Ele existe para aproximar os membros e deixar a convivência mais interativa. Cada edição traz notícias, entrevistas, curiosidades, humor e acontecimentos da comunidade, e às vezes assuntos de fora que tenham a ver com o grupo. A ideia é trazer novidade e movimento para a comunicação da Masayoshi, sem deixar as publicações monótonas.

As regras abaixo vêm do guia editorial ("Jornal Masayoshi — Guia editorial e identidade visual"):

- **Frequência:** edições regulares **aos sábados, uma semana sim e outra não**. Na semana sem jornal acontece um evento, para não sobrecarregar os responsáveis.
- **Edições especiais:** em datas importantes, como aniversário da Masayoshi, Halloween, Natal, fim de ano, grandes eventos e retrospectivas.
- **Produção:** feita pela redação (diretoria e quem tem a permissão do Jornal).
- **Onde sai:** o **portal é o lugar principal de leitura**, com o arquivo das edições organizado por data. A edição também é divulgada no grupo.
- **Apresentador:** o Corvinho é o apresentador principal, mas isso pode mudar no futuro.

## Quadros

Cada edição é dividida em **quadros**. Cada edição escolhe livremente quais quadros entram, e todos ficam juntos no PDF principal da edição.

| Quadro | Chave no código | Cor | Quando aparece |
| --- | --- | --- | --- |
| Jornal Masayoshi (geral) | `geral` | cinza | capa, abertura, encerramento, o que não é de um quadro |
| Plantão Masayoshi | `plantao` | vermelho `#dc2626` + preto | só quando há algo urgente ou marcante |
| Corvinho Entrevista | `corvinho-entrevista` | amarelo `#facc15` + preto | conforme a programação |
| Você Sabia? | `voce-sabia` | azul `#1d6fd1` + amarelo | presença regular |
| Conhecendo os Membros | `conhecendo-membros` | laranja `#f28c1b` | presença regular, um membro por edição |
| Meme do Mês | `meme` | verde `#1f9d55` | de vez em quando, mais nas retrospectivas |
| Notícias que Ninguém Pediu | `noticias` | azul claro `#8fd6f0` | quando houver história boa |
| Túnel do Tempo | `tunel` | marrom `#8b5a2b` | edições comemorativas e retrospectivas |
| Turma do Corvinho | `corvinho` | roxo `#7e3fbf` | o gibi oficial (veja abaixo) |
| Edição Especial | `especial` | roxo `#8e44ad` + vermelho | edições especiais |

As cores ficam em `css/jornal.css`, nos seletores `[data-quadro="..."]` (`--quadro` e `--quadro-2`). Os nomes ficam em `QUADROS`, em `js/pages/jornal-edicoes.js`.

**Turma do Corvinho:** é o universo do Corvinho e da turma, e tem duas partes na aba dela:
- **Episódios:** vídeos (incluindo os feitos com IA), criados pelo botão **+ Novo episódio**. Cada episódio é independente das edições.
- **Gibis:** o gibi só existe como quadro `corvinho` dentro de uma edição, porque gibi solo é raro (decisão de 26/11/2026). A aba reúne sozinha os quadros `corvinho` de todas as edições.

## Como funciona no portal

### Para quem lê

- A página `jornal.html` tem duas abas: **Edições** e **Turma do Corvinho** (Episódios em vídeo + Gibis).
- **Episódio:** abre numa janela com o player, curtir e comentários, com o título "Turma do Corvinho · Episódio NN".
- Em **Edições**, a mais recente aparece em destaque, com a capa, o sumário dos quadros e o botão "Ler edição". As anteriores ficam em cards logo abaixo.
- **Leitor de edição** (tela cheia), para edições feitas com páginas do PDF:
  - **Edição completa** (padrão): todas as páginas do PDF uma embaixo da outra, iguais à diagramação, em 2000 px de largura.
  - **Por quadro:** mostra só as páginas de um quadro, com a faixa colorida, e botões para o quadro anterior e o próximo.
  - **Barra de quadros** no topo, para pular direto a um quadro.
  - **Miniaturas das páginas:** no computador ficam numa coluna à esquerda, separadas por quadro. No celular abrem pelo botão "Páginas". Clicar numa miniatura vai direto à página, e a página que está na tela fica marcada. No modo Por quadro, clicar numa página de outro quadro troca para esse quadro.
  - **Zoom:** tocar na página abre em tela cheia, com pinça, duplo toque, arrastar, deslizar para virar a página, roda do mouse e setas.
  - **"Texto da página":** o texto que o portal leu do PDF.
  - **Curtir e comentar**, no topo e no fim.
- Edições montadas à mão (texto e fotos) abrem num leitor de texto corrido, estilo jornal, com os quadros em sequência.
- **Capa:** é a primeira imagem da edição. Se a edição não tiver nenhuma imagem, o portal gera uma capa de jornal com o título, o resumo, a primeira matéria e os quadros.

### Para a redação

Só a diretoria e quem tem a permissão `gerenciar_jornal` (`MSYPerms`). A checagem fica em `js/pages/jornal.js`, em `state.canManage`.

1. Clicar em **+ Nova edição** e preencher título, número, tipo (regular ou especial), data, publicação (rascunho, publicado ou arquivado) e resumo.
2. **Importar do PDF** (opcional, recolhido no fim do editor):
   - **Páginas do PDF** (recomendado): cada página vira uma imagem WebP de 2000 px. O texto da página fica guardado e o quadro é reconhecido pelo cabeçalho (ex.: "PLANTÃO MASAYOSHI" → Plantão, "GIBI OFICIAL" → Turma do Corvinho). Páginas seguidas do mesmo quadro ficam juntas.
   - **Separar texto e fotos:** o modo antigo, que transforma tudo em texto corrido com as fotos recortadas.
   - **OCR** (opcional, mais lento): lê o texto das páginas que são só imagem. **Ainda não foi testado.**
3. **Revisar os quadros:** trocar o quadro de cada grupo, dar títulos, "começar um quadro novo aqui" (tesoura), juntar com o de cima, subir e descer. Também dá para montar a edição do zero, sem PDF, com texto, subtítulo, destaque e fotos.
4. **Salvar.** Rascunho só a redação vê. "Publicado" aparece para todos.
5. **Novo episódio** (Turma do Corvinho): título, número (sugere o próximo), data, publicação, resumo, vídeo (MP4/WebM/MOV, **até 50 MB**, limite do Worker do R2) e capa opcional. Sem capa, o portal tira um quadro do vídeo no formato dele (16:9 ou vertical, sem cortar).
6. **Editar / Excluir:** botões no destaque, em cada card e no rodapé do editor. Excluir pede confirmação e apaga a edição e as imagens no R2.

Uma edição de 28 páginas leva cerca de 20 s para ler o PDF e mais o tempo de envio das imagens. Ela ocupa uns 10 a 15 MB no R2.

## Onde está no código

| Arquivo | O que tem |
| --- | --- |
| `jornal.html` | a página; carrega `css/jornal.css` e `js/pages/jornal.js` (ES module) |
| `js/pages/jornal.js` | carregamento dos posts, cabeçalho e abas, curtidas, visualizações, comentários, exclusão, modais |
| `js/pages/jornal-edicoes.js` | tudo de edição: listagem, aba do Corvinho, capa gerada, leitor (páginas e texto), zoom, editor de quadros, envio das imagens |
| `js/pages/jornal-edicoes-import.js` | leitura do PDF no navegador (pdf.js 4.10.38 e tesseract.js 5.1.1 pelo jsDelivr) |
| `css/jornal.css` | visual do Jornal, cores dos quadros, leitor, zoom e editor |
| `supabase/migrations/20261126_jornal_edicoes.sql` | libera `post_type = 'edition'` e `section = 'edicoes'` em `jornal_posts` (já aplicada) |

### Como o episódio é guardado

`jornal_posts` com `post_type = 'video'`, `section = 'videos'`, `video_url` / `video_storage_path` (R2 `jornal-media/<uid>/videos/`), `cover_url` / `cover_storage_path` (`<uid>/covers/`) e `content_blocks = [{ "type": "episode", "series": "corvinho", "number": 1 }]`. Trocar o vídeo ou a capa apaga o arquivo antigo do R2 depois de salvar.

### Como a edição é guardada

Uma edição é uma linha de `jornal_posts` com `post_type = 'edition'` e `section = 'edicoes'`. O conteúdo fica em `content_blocks` (jsonb):

```json
[
  { "type": "edition", "number": 1, "kind": "regular", "format": "quadros" },
  { "type": "quadro", "quadro": "plantao", "title": "Corvinho assume o plantão",
    "items": [
      { "type": "image", "url": "...", "path": "<uid>/edicoes/...webp", "w": 2000, "h": 2830,
        "full": true, "alt": "texto lido do PDF", "caption": "", "page": 2 },
      { "type": "heading", "text": "..." }, { "type": "paragraph", "text": "..." }, { "type": "quote", "text": "..." }
    ] }
]
```

- **Edição "em páginas":** todos os itens são imagens com `full: true`. É ela que abre no leitor de páginas (`isPagesEdition`).
- **Arquivos:** ficam no R2, bucket `jornal-media`, em `<uid>/edicoes/<data>-<lote>-NNN.webp`, com uma versão leve `.sm.webp` para dados móveis. As imagens estão só em `content_blocks`, não em `jornal_media`. A limpeza diária de órfãos do R2 lê o jsonb, então elas contam como usadas.
- **Formato antigo** (páginas em `jornal_media` + `toc`): o portal ainda converte na leitura (`legacyQuadros`). O comentário da migration fala desse formato antigo.

## Decisões tomadas (26/11/2026)

- **O Jornal agora é só Edições e Turma do Corvinho.** Saíram as abas Destaques, Vídeos, Jornal escrito, Tirinhas, Especiais e Arquivo, os filtros de formato, a coluna lateral e o botão "Nova publicação". Não havia publicação antiga no banco, então nada foi perdido. Links antigos `#post-<id>` ainda abrem.
- **O tipo "Gibi da Turma do Corvinho" solo foi removido**, porque o gibi é raro sozinho.
- **A edição é lida pelas páginas do PDF**, porque preserva a diagramação feita no Canva. O texto corrido virou opção secundária.
- **O visual segue o padrão do portal:** `page-header`, fonte Cinzel, cards `--black-3` e abas douradas. Só o leitor tem visual próprio.
- **A capa é a primeira foto da edição** (a do PDF).
- **Episódios em vídeo (IA) entram na Turma do Corvinho** (27/11/2026). Topo da página: **+ Novo episódio** e **+ Nova edição**.

## Plano (próximas etapas)

1. ~~Publicar o que já existe~~ (feito em 27/11/2026).
2. **Pauta da redação:** cada pessoa escreve o seu quadro no portal (rascunho → pronto → usado), todos aparecem juntos e dá para abrir cada um separado. Quem monta passa para o Canva, exporta o PDF e importa. Precisa de tabela nova.
3. **Publicação:** publicar agora ou **agendar** dia e hora, com **notificação** para todos quando sair. Precisa de campo de agendamento e de rotina no banco.
4. **Marcar membros (@):** a pessoa citada recebe aviso e a matéria aparece no perfil dela, em "No Jornal".

## Pendências conhecidas

- As tabelas `jornal_likes` e `jornal_views` **não existem no Supabase**. Hoje curtidas e visualizações ficam só no navegador de cada pessoa, e o console mostra aviso. Criar junto com a etapa 3.
- O OCR da importação não foi testado.
- Vídeos de episódio acima de 50 MB são recusados. Se os vídeos de IA forem maiores, é preciso subir o limite no Worker `msy-media` (e conferir o custo de armazenamento no R2).
- A edição 01 (`949b5996-beb6-405b-9146-a232b9056b78`) está como **rascunho**, em páginas, com 6 quadros. Publicar depois do deploy.

## Como validar

- Abrir `jornal.html` logado com a diretoria: aparecem duas abas com contador, o botão **+ Nova edição** e os botões Editar/Excluir.
- Abrir com uma conta de membro: rascunhos não aparecem e os botões da redação somem.
- Abrir a edição: alternar "Edição completa" / "Por quadro", usar a barra de quadros, dar zoom e virar a página.
- Importar um PDF no modo Páginas, conferir os quadros, salvar como rascunho, excluir e confirmar que sumiu.
- Testar em 375 px de largura: nada pode estourar a tela.
- Depois de mudar `.js` ou `.css`, subir o `?v=` em `jornal.html` e nos `import` entre os módulos.
