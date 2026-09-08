# Comissionamento — implementação e ativação

O módulo usa o Portal existente: `comissionamento.html`, navegação e temas compartilhados, `window.MSY`, `MSYPerms`, Supabase Auth e o banco atual. Não cria autenticação ou aplicação paralela.

## Regras implementadas

- Base = bruto menos custos pagos pela MSY.
- 25% fixos MSY, 10% indicação e 65% execução prevista.
- Execução individual = base individual × participação (0, 50, 75 ou 100%). **Toda redução fica com a MSY**, conforme a decisão posterior ao pedido original. Não existe redistribuição entre pessoas. A participação não vem pré-preenchida: deve ser definida manualmente por participante e é obrigatória para análise/aprovação.
- Pesos usam pontos-base (10000 = 100%) e devem fechar exatamente para análise/aprovação. Valores monetários são centavos inteiros.
- Indicação e execução previstas arredondam meio centavo para cima; parte fixa fecha o saldo da base. As bases individuais usam divisão inteira, com resíduo no último peso positivo. A participação é aplicada à base em centavos; retenção é a diferença exata.
- Aprovação não libera pagamentos sem quitação integral do bruto pelo cliente. Custos já estão descontados nas comissões. Não há parcelas ou transferências bancárias nesta versão.
- Um pagamento corresponde ao valor integral aprovado de uma pessoa e tipo (execução ou indicação). Datas podem diferir entre pagamentos.
- Salvar revisão financeira revoga aprovação; versões anteriores permanecem. Mudar o bruto também revoga a quitação. Qualquer pagamento bloqueia edição financeira/cancelamento.
- Cancelamento exige motivo e preserva histórico. Comissões zeradas não geram pagamentos; projeto quitado sem obrigações positivas fica concluído.
- Limites de entrada: R$ 1 bilhão por projeto, 200 participantes, 100 custos, arquivos até 10 MB. Não há nomes fixos no código de produção.

## Banco e interfaces

A migração aditiva é `supabase/migrations/20260908000000_commission.sql`.

Entradas de projeto, indicação e custos ficam num documento JSON versionado em `commission_projects.input`. O resultado calculado fica em `result`. Evita tabelas intermediárias sem uso independente, mantendo o conjunto financeiro atômico. Participantes, pagamentos, evidências, revisões e histórico têm tabelas próprias. `projects` é apenas vínculo opcional; seus dados não sincronizam distribuições aprovadas.

`commission_command(p_action, p_id, p_version, p_payload)` oferece `create`, `save`, `review`, `approve`, `settle`, `pay` e `cancel`. Recebe entradas e recalcula valores; ignora valores de pagamento enviados pelo cliente. `p_version` detecta edição concorrente; UUID fornecido na criação torna retries idempotentes. Cada comando bloqueia a linha e grava histórico na mesma transação.

`commission_read(p_id, p_own)` retorna o espaço administrativo, detalhe de projeto ou projeção pessoal. `p_own=true` usa exclusivamente `auth.uid()`, sem aceitar identidade alternativa. Não retorna custos, totais da empresa, colegas ou histórico administrativo.

As funções públicas são wrappers `SECURITY INVOKER`; implementações privilegiadas ficam no schema não exposto `commission_private`, com `search_path` fixo, verificações de sessão ativa/permissão e concessões explícitas. Todas as tabelas novas usam RLS e não concedem leitura/escrita direta aos clientes. Não expor `commission_private` na Data API.

Permissões no gerenciador existente:

| Permissão | Efeito |
|---|---|
| `commission.view_own` | Permite enxergar a aba e consultar as próprias comissões |
| `commission.view_all` | Consulta administrativa de todos os projetos |
| `commission.create` | Criação e consulta dos próprios cálculos administrativos |
| `commission.edit` | Edição e envio para análise nos cálculos acessíveis |
| `commission.approve` | Aprovação e definição final de participação |
| `commission.mark_paid` | Quitação do cliente e pagamentos aos membros |
| `commission.delete` | Cancelamento antes do primeiro pagamento |

Diretoria tem todos os acessos, seguindo o Portal. Para qualquer membro fora da diretoria, a diretoria deve conceder `commission.view_own` para a aba aparecer. Para delegar edição/aprovação/pagamentos em projetos de terceiros, conceder também `view_all` e as permissões da operação. A visibilidade da aba usa `tab_permissions`, portanto também pode ser restringida por tier, cargo ou pessoa no workspace existente de acesso às abas. Modo de visualização de membro mostra somente a consulta pessoal.

## Validação realizada nesta sessão

- `npm run test:commission`: 8 testes aprovados, incluindo 10.000 combinações com fechamento exato, custos, indicação institucional, participações reduzidas, duplicidade e entradas inválidas.
- Verificação de sintaxe dos módulos novos e dos arquivos compartilhados alterados.
- `tests/commission-browser.cjs`: execução no Edge com HTML/CSS/módulo reais e **RPC/auth simulados**. Exercita cálculo instantâneo, criação, aprovação, bloqueio até quitação, pagamentos separados, trava financeira, visão pessoal e layouts desktop/celular/claro.
- Capturas locais em `.commission-test/` (ignoradas pelo Git).
- `tests/commission-database.sql`: preparado para PostgreSQL descartável, **não executado nesta sessão**. Testa cálculo SQL, estados, versionamento, dupla gravação, proteção por usuário, valores autoritativos e Storage.

O navegador automatizado usou Playwright Core já presente no cache local porque `agent-browser` não estava disponível e o ambiente bloqueou instalações de rede. Para repetir, usar uma instalação de Playwright Core e um executável Chromium/Edge:

```powershell
node tests/commission-browser.cjs <diretorio-playwright-core> <caminho-do-navegador>
```

## Ativação pendente

**O banco real não foi consultado nem alterado.** O conector recusou acesso e a consulta SQL exigiu aprovação incompatível com a política da sessão. A CLI também não pôde ser instalada. O arquivo de migração foi preparado localmente; não é evidência de migração aplicada.

1. Em sessão com acesso ao Supabase, comparar o esquema instalado com as migrações do repositório. Confirmar `profiles`, `projects`, `project_role_options`, `member_permissions`, `tab_permissions`, `is_diretoria`, `has_permission`, `is_project_member` e `can_access_tab`. Confirmar proteção do campo `profiles.tier` e RLS dos cadastros existentes.
2. Executar `tests/commission-database.sql` somente em banco PostgreSQL **vazio e descartável**, com `psql -v ON_ERROR_STOP=1 -f tests/commission-database.sql`. O teste recusa banco com `profiles` existente. Nunca executar esse harness no Portal.
3. Aplicar a migração em staging e testar com autenticação Supabase real: diretoria, membro comum, criador limitado e aprovador delegado. Conferir políticas existentes de Storage, uploads privados, links assinados, revogação de acesso e nenhuma leitura cruzada.
4. Rodar os advisors do Supabase e corrigir qualquer alerta pertinente antes da produção. Confirmar que apenas os wrappers públicos estão acessíveis pela Data API.
5. Executar os cenários de Comissionamento e o checklist do Portal em `SMOKE_TESTS.md` no preview.
6. Aplicar a migração validada antes de publicar a interface. Sem a migração, a página apresenta indisponibilidade explícita e não salva valores localmente como se estivessem no banco.

Se houver problema após ativação, ocultar a aba pelo controle existente e preservar tabelas/histórico. Não apagar registros financeiros como forma de rollback.
