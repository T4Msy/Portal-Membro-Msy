# Documentação de Mudanças do Portal

Toda alteração no Portal MSY deve ser documentada no mesmo trabalho em que é criada. Esta regra vale para pessoas e para qualquer IA que leia, altere ou crie arquivos no projeto.

O objetivo é permitir que a próxima pessoa ou IA entenda rapidamente o que existe, por que existe, onde foi alterado e como validar a mudança, sem depender do histórico da conversa.

## Regra obrigatória

Ao modificar o portal, registre a mudança em uma documentação adequada ao domínio ou crie um documento específico quando ela introduzir uma funcionalidade nova. Não considere uma alteração concluída sem esse registro.

O registro deve informar, no mínimo:

1. **O que mudou:** funcionalidade, correção, regra, tela ou comportamento criado/alterado.
2. **Por que mudou:** necessidade de negócio, problema resolvido ou critério da decisão.
3. **Onde mudou:** arquivos, tabelas, migrations, Edge Functions e páginas afetadas.
4. **Como funciona agora:** fluxo esperado, permissões e critérios de uso.
5. **Como validar:** testes executados e verificações manuais necessárias.
6. **Impactos e pendências:** migrations a aplicar, dependências externas, compatibilidade ou riscos conhecidos.

## Reenvio de justificativa recusada - 2026-09-19

**O que mudou:** o membro agora recebe um aviso de que a justificativa anterior foi recusada e pode enviar uma nova justificativa no cartao ou nos detalhes do evento.

**Por que mudou:** permitir que o membro corrija ou complemente a justificativa sem precisar marcar presenca.

**Arquivos e servicos afetados:** `js/app.js` e `eventos.html`.

**Como funciona:** o novo envio atualiza a justificativa existente, define o status como `pendente` e notifica a Diretoria. A justificativa entra na aba Justificativas com as acoes de aprovar ou recusar.

**Validacao realizada:** sintaxe de `js/app.js` verificada com `node --check` e diff validado com `git diff --check`.

**Pendencias ou cuidados para deploy:** publicar `js/app.js` e `eventos.html`; a nova versao no URL do script evita que o navegador reutilize o JavaScript anterior.

## Onde documentar

| Tipo de mudança | Local de documentação |
| --- | --- |
| Insígnias e premiações | `INSIGNIAS.md` |
| Comissionamento | `COMISSIONAMENTO.md` |
| Checklist de release ou teste manual | `SMOKE_TESTS.md` |
| Arquitetura, configuração ou operação geral | `README.md` |
| Funcionalidade nova sem documento próprio | Novo arquivo `.md` na raiz, com nome descritivo |
| Banco de dados | Comentários na migration e referência no documento do domínio |

## Modelo para novas entradas

Use este modelo ao registrar uma alteração em um documento existente ou novo:

```md
## [Nome da mudança] — AAAA-MM-DD

**O que mudou:**

**Por que mudou:**

**Arquivos e serviços afetados:**

**Como funciona:**

**Validação realizada:**

**Pendências ou cuidados para deploy:**
```

## Procedimento para IAs

Antes de alterar qualquer parte do portal, a IA deve:

1. Ler a documentação do domínio afetado e as instruções do repositório.
2. Identificar os arquivos e o impacto da alteração antes de editar.
3. Implementar somente o escopo solicitado e preservar mudanças existentes de outras pessoas.
4. Atualizar a documentação aplicável com o modelo acima.
5. Informar claramente o que foi alterado, o que foi validado e o que ainda exige ação manual.

Se a alteração criar uma nova tabela, migration, integração, regra de permissão, tela, insígnia ou fluxo operacional, a documentação deve explicar o propósito, a origem dos dados, quem pode usar e como reverter ou desativar com segurança.

## Aplicação atual

Esta política passa a valer para todas as mudanças futuras. A documentação da insígnia **Aniversário da Masayoshi — 5 anos** está em `INSIGNIAS.md` e é o exemplo de registro de uma funcionalidade nova com arte, critério, migration, local de exibição e validação.

## Ordem de Contribuição Especial — 2026-09-13

**O que mudou:** `Contribuição Especial` passou a ser exibida antes das demais premiações da categoria Especial.

**Por que mudou:** manter o reconhecimento de contribuição em posição de destaque na lista de Premiações & Reconhecimento.

**Arquivos e serviços afetados:** `js/modules.js` e a tela `premiacoes.html`.

**Como funciona:** somente o título exato `Contribuição Especial` recebe prioridade; as outras premiações especiais continuam em ordem alfabética.

**Validação realizada:** ordenação verificada no código de agrupamento da lista.

**Pendências ou cuidados para deploy:** publicar o arquivo JavaScript atualizado e recarregar o portal sem cache.

## Remoção dos Alertas do Sistema — 2026-09-13

**O que mudou:** a seção `Alertas do Sistema` deixou de ser inserida na tela de Administração.

**Por que mudou:** a seção não deve mais fazer parte do painel administrativo.

**Arquivos e serviços afetados:** `js/modules3.js`, `README.md`, `CLAUDE.md` e `admin.html` durante a inicialização.

**Como funciona:** a Administração mantém seus demais cards e permissões, mas não executa a rotina que criava o card de alertas.

**Validação realizada:** a inicialização administrativa dos alertas foi bloqueada no roteador do módulo.

**Pendências ou cuidados para deploy:** publicar `js/modules3.js` e atualizar a página sem cache.

## Reformulação da Administração — 2026-09-13

**O que mudou:** a Administração foi reorganizada em uma central visual premium e minimalista, com pendências de aprovação em destaque, atalhos compactos e configurações separadas da atividade recente.

**Por que mudou:** reduzir a competição visual entre cards e tornar as decisões administrativas mais rápidas de identificar.

**Arquivos e serviços afetados:** `js/app.js`, `css/style.css` e a tela `admin.html`.

**Como funciona:** aprovações pendentes aparecem como prioridade; na ausência delas, a tela mostra o estado positivo da operação. As ações continuam com os mesmos destinos e comportamentos, enquanto o controle de abas fica na área secundária.

**Validação realizada:** sintaxe de `js/app.js` validada com `node --check`; responsividade configurada para desktop, tablet e celular.

**Pendências ou cuidados para deploy:** publicar os arquivos atualizados e recarregar a Administração sem cache para receber os novos estilos.

## Reconstrução visual da Administração — 2026-09-13

**O que mudou:** o painel administrativo foi recriado sem cards individuais de métricas ou atalhos em quadrados. A nova composição usa cabeçalho de comando, resumo em linha, fila de aprovações, operações em lista e áreas de configuração e cadastros recentes.

**Por que mudou:** a versão anterior ainda parecia fragmentada e visualmente carregada, mesmo após a reorganização inicial.

**Arquivos e serviços afetados:** `js/app.js`, `css/style.css` e a tela `admin.html`.

**Como funciona:** as mesmas ações administrativas e consultas ao banco permanecem disponíveis, mas são apresentadas em uma hierarquia contínua com menos caixas e mais espaço visual.

**Validação realizada:** sintaxe de `js/app.js` validada com `node --check` e verificação de whitespace com `git diff --check`.

**Pendências ou cuidados para deploy:** publicar `js/app.js` e `css/style.css`; atualizar a página sem cache para garantir o carregamento da nova versão.

## Ajuste de paleta da Administração — 2026-09-13

**O que mudou:** a superfície da Administração passou a usar grafite quente, vinho discreto e detalhes dourados em vez de um fundo predominantemente preto.

**Por que mudou:** dar profundidade e conforto visual ao novo painel sem reintroduzir os cards isolados.

**Arquivos e serviços afetados:** `css/style.css` e a tela `admin.html`.

**Como funciona:** o painel mantém a composição contínua, mas agora possui camadas de cor, contraste entre seções e estados de hover mais visíveis.

**Validação realizada:** regras responsivas e integridade do diff verificadas localmente.

**Pendências ou cuidados para deploy:** publicar o CSS atualizado e atualizar a página sem cache.

## Redesign da tela de Permissões — 2026-09-13

**O que mudou:** a tela de Permissões foi alinhada ao visual da Administração, usando a mesma base grafite da barra lateral e seções contínuas para acesso individual e visibilidade de abas.

**Por que mudou:** reduzir fundos dourados/vinho e cards isolados, tornando a gestão de acessos mais limpa e consistente com o portal.

**Arquivos e serviços afetados:** `css/modules3.css`, `js/modules3.js` e a tela `permissoes.html`.

**Como funciona:** todas as regras, filtros, seletores e botões existentes são preservados; a alteração é exclusivamente de composição visual e responsividade.

**Validação realizada:** sintaxe de `js/modules3.js` e integridade do diff verificadas localmente.

**Pendências ou cuidados para deploy:** publicar `css/modules3.css` e atualizar a página sem cache.

## Fluxo de seleção em Permissões — 2026-09-13

**O que mudou:** o gerenciador de permissões passou a ter duas etapas: escolher um membro e, somente então, configurar suas permissões.

**Por que mudou:** evitar que a lista de membros e todas as permissões concorram pela atenção na mesma tela, deixando a gestão mais objetiva.

**Arquivos e serviços afetados:** `js/modules3.js`, `css/modules3.css`, tabelas `profiles`, `member_permissions` e `supervision_access`.

**Como funciona:** a primeira etapa permite buscar e selecionar um membro; a segunda exibe as permissões dele em largura total e oferece o botão `Escolher membro` para retornar. O fluxo de salvar, limpar e atualizar contagens permanece o mesmo.

**Validação realizada:** sintaxe JavaScript e integridade do diff verificadas localmente.

**Pendências ou cuidados para deploy:** publicar `js/modules3.js` e `css/modules3.css`; testar seleção, retorno, alteração e salvamento de permissões no portal.

## Configuração expansível de abas — 2026-09-13

**O que mudou:** a área de Visibilidade de abas passou a listar somente os nomes e status das abas. Ao clicar em uma aba, abre-se um painel com a opção de exibir ou ocultar, cargos/funções e membros autorizados.

**Por que mudou:** reduzir a quantidade de controles visíveis ao mesmo tempo e facilitar a configuração de uma aba por vez.

**Arquivos e serviços afetados:** `js/modules3.js`, `css/modules3.css` e a tabela `tab_permissions`.

**Como funciona:** apenas uma aba fica expandida por vez. Alterações atualizam o status da aba na lista e continuam sendo gravadas pelo botão `Salvar alterações`.

**Validação realizada:** sintaxe de `js/modules3.js` e integridade do diff verificadas localmente.

**Pendências ou cuidados para deploy:** publicar os arquivos atualizados; testar exibição, restrição por cargo, restrição por membro e salvamento no portal.

## Foco ao configurar permissões de membro — 2026-09-13

**O que mudou:** a seção `Visibilidade de abas` fica oculta enquanto um membro está selecionado para configuração de permissões.

**Por que mudou:** impedir que configurações globais de abas disputem atenção com a edição individual do membro.

**Arquivos e serviços afetados:** `js/modules3.js` e a tela `permissoes.html`.

**Como funciona:** ao escolher um membro, a seção é ocultada; ao usar `Escolher membro` para retornar à lista, ela volta a ser exibida.

**Validação realizada:** fluxo de eventos e sintaxe JavaScript verificados localmente.

**Pendências ou cuidados para deploy:** publicar `js/modules3.js` e testar a transição entre seleção, edição e retorno no portal.

## Correção de abas ocultas — 2026-09-13

**O que mudou:** uma aba marcada como oculta, incluindo `Jornal da Masayoshi`, agora é bloqueada antes de qualquer verificação alternativa de permissão. O teaser do Jornal no dashboard também respeita essa regra.

**Por que mudou:** a verificação RPC podia autorizar uma página antes da regra local de visibilidade ser aplicada, fazendo uma aba oculta aparecer para membros.

**Arquivos e serviços afetados:** `js/app.js`, `tab_permissions`, navegação lateral, proteção de páginas e teaser do dashboard.

**Como funciona:** as regras de abas são carregadas do banco a cada nova página; se `visible` estiver como `false`, o menu, o teaser e o acesso pela página são negados para membros.

**Validação realizada:** ordem das regras revisada e sintaxe JavaScript verificada localmente.

**Pendências ou cuidados para deploy:** publicar `js/app.js`, atualizar o portal sem cache e testar com uma conta de membro após ocultar o Jornal.

## Guia de níveis em Premiações — 2026-09-13

**O que mudou:** foi incluído um guia em `Premiações & Reconhecimento` para explicar os níveis Comum, Raro, Épico e Lendário, suas cores e os totais de insígnias necessários.

**Por que mudou:** tornar claro para todos os membros como as conquistas refletem no nível visual do perfil.

**Arquivos e serviços afetados:** `js/modules.js`, `css/style.css` e a tela `premiacoes.html`.

**Como funciona:** o guia mostra a progressão 0–9, 10+, 50+ e 100+ insígnias e explica a regra de contagem usada no perfil.

**Validação realizada:** sintaxe JavaScript e integridade do diff verificadas localmente.

**Pendências ou cuidados para deploy:** publicar `js/modules.js` e `css/style.css`; conferir o guia em desktop e celular.

## Total de insígnias no perfil — 2026-09-13

**O que mudou:** o cabeçalho `Insígnias Conquistadas` do perfil do membro passou a exibir o total de insígnias ao lado do título.

**Por que mudou:** deixar visível a contagem que define o nível Comum, Raro, Épico ou Lendário do membro.

**Arquivos e serviços afetados:** `js/app.js`, `css/style.css` e o modal de perfil em `membros.html`.

**Como funciona:** o total exibido usa o mesmo cálculo ponderado do nível visual, sem uma nova consulta ou contador paralelo.

**Validação realizada:** sintaxe JavaScript e integridade do diff verificadas localmente.

**Pendências ou cuidados para deploy:** publicar `js/app.js` e `css/style.css`; abrir um perfil com insígnias para conferir a contagem.

## Responsividade de Permissões — 2026-09-13

**O que mudou:** foram adicionados ajustes específicos para celular ao seletor de membros, à configuração individual e ao editor expansível de abas.

**Por que mudou:** impedir que nomes, ações e campos de restrição comprimam ou transbordem em telas estreitas.

**Arquivos e serviços afetados:** `css/modules3.css` e a tela `permissoes.html`.

**Como funciona:** em telas menores, o seletor passa para uma coluna, os controles da pessoa selecionada ocupam toda a largura e o editor de abas reduz espaçamentos sem perder os controles.

**Validação realizada:** breakpoints revisados para os novos componentes e integridade do diff verificada localmente.

**Pendências ou cuidados para deploy:** testar manualmente em uma largura de 360 px e em um celular real após publicar.

## Base visual unificada da Administração — 2026-09-13

**O que mudou:** o fundo do painel administrativo passou a usar o mesmo gradiente grafite da barra lateral.

**Por que mudou:** remover a aparência de bloco separado e manter a identidade visual escura uniforme do portal.

**Arquivos e serviços afetados:** `css/style.css` e a tela `admin.html`.

**Como funciona:** vinho e dourado permanecem somente em bordas, ícones e estados de interação; a superfície principal acompanha a barra lateral.

**Validação realizada:** integridade do diff verificada localmente.

**Pendências ou cuidados para deploy:** publicar o CSS atualizado e atualizar a página sem cache.

## Equilíbrio de contraste da Administração — 2026-09-13

**O que mudou:** os tons claros introduzidos na Administração foram reduzidos para uma paleta escura intermediária.

**Por que mudou:** preservar a identidade dark do portal sem deixar as seções indistinguíveis.

**Arquivos e serviços afetados:** `css/style.css` e a tela `admin.html`.

**Como funciona:** grafite continua como cor predominante; vinho e dourado aparecem apenas em transparências e detalhes de profundidade.

**Validação realizada:** integridade do diff verificada localmente.

**Pendências ou cuidados para deploy:** publicar o CSS atualizado e atualizar a página sem cache.
