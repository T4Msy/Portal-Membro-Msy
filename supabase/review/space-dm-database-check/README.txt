RELATÓRIO DE REVISÃO — CAPACIDADE DO SUPABASE E DMs DO MSY SPACE
Data: 31/10/2026
Projeto indicado pelo site/repositório: lldzgkxpoyqauxdcjyaw
Local: C:\Users\joaov\Portal-Membro-Msy

ESTADO DA CONFIRMAÇÃO
Não foi possível confirmar se o banco está cheio. O console enviado contém erros HTTP 404 para RPCs e um evento Realtime heartbeat timeout que depois se recuperou. Não há métrica de uso, erro de falta de espaço, leitura apenas, ou resposta SQL nesse log. Um 404 de RPC não é prova de banco cheio: PostgREST pode retornar 404 PGRST202 quando não encontra a função no cache do esquema, por função ausente, assinatura incorreta ou cache desatualizado. Para distinguir essas causas, capture no DevTools > Network > POST space_dm_start > Response o JSON completo (code, message, details, hint) e execute diagnostics/read-only-checks.sql.

Estado local conhecido: o site aponta para o projeto lldzgkxpoyqauxdcjyaw. A migration social existe localmente, mas sua presença no Git não comprova execução remota. Nesta sessão não foi possível consultar o Dashboard/banco remoto. Nenhuma migration foi aplicada remotamente. Um banco cheio poderia ter impedido uma aplicação anterior e, indiretamente, deixado a RPC ausente; isso é uma hipótese que precisa ser confirmada com as métricas e a resposta PostgREST.

DISTINÇÃO DE USO/ESPAÇO
- Tamanho do banco (Database size) é o espaço lógico de tabelas, índices e visões materializadas.
- Tamanho do disco (Disk size) também inclui WAL e arquivos de sistema; pg_database_size sozinho não confirma quota/disco cheio.
- Supabase Storage é uma métrica separada de objetos/arquivos; veja seus limites no uso do projeto.
- Confirme Database size em Reports > Database Size; confirme a distribuição Database/WAL/System na página Infrastructure do projeto e usage/billing da organização. Veja a documentação oficial Supabase “Understanding Database and Disk Size” e “Manage Storage size usage”.
- Não apague dados como tentativa de resolver até identificar qual cota está em falta e quais objetos ocupam espaço. Não rode VACUUM FULL nem reduza quotas sem revisão.

FALHAS OBSERVADAS E INTERPRETAÇÃO
1. POST /rest/v1/rpc/space_dm_start → 404 repetido. A chamada JS envia { p_peer: UUID }. A migration local define public.space_dm_start(p_peer uuid), SECURITY DEFINER; nomes e tipo coincidem. O corpo HTTP completo não veio no log (DevTools mostra “Object” sem expandir), portanto causa remota final não confirmada. PGRST202 sugere função ausente do cache/DB; uma falha SQL/RLS depois de resolver a função normalmente aparece com outro status/código.
2. POST /rest/v1/rpc/space_save_channel → 404. A migration local declara parâmetros p_channel uuid, p_name text, p_kind text, p_category uuid, p_private boolean e p_members uuid[], que coincidem com o formulário. Mesmo diagnóstico: investigar presença/cache/exposição da API, sem assumir causa única.
3. space:workspace → CHANNEL_ERROR “heartbeat timeout” e depois SUBSCRIBED. Isso indica que a assinatura se recuperou. O código local agora recarrega categorias, canais e membros após reconexão para reconciliar alterações perdidas durante a queda; não cria loop de retry manual.
4. “Enviar mensagem” falha enquanto space_dm_start retorna erro; o app agora evita chamadas simultâneas repetidas para o mesmo membro, mostra estado “Abrindo conversa…” e registra status HTTP, código, mensagem, detalhes e dica quando fornecidos.

ARQUIVOS LOCAIS PARA REVISÃO
- migrations-for-review/20261031_msy_space_channels_dm.sql — migration social: canais privados e RLS, tabelas space_dm_conversations / space_dm_participants / space_dm_messages, funções space_save_channel, space_dm_list_conversations e space_dm_start, grants e tópicos Realtime.
- migrations-for-review/20261101_msy_space_rpc_realtime_cache.sql — migration corretiva: valida assinaturas e SECURITY DEFINER das funções, ajusta EXECUTE para authenticated e envia NOTIFY pgrst, 'reload schema'. Não cria conversas, não apaga dados e falha de forma explícita se a migration social estiver ausente.
- diagnostics/read-only-checks.sql — consultas somente leitura para tamanho, WAL, maiores relações, Storage, RPCs, RLS, policies e publicação Realtime.

ORDEM DE REVISÃO/APLICAÇÃO (NÃO EXECUTADA)
1. No Dashboard, confirmar o ref lldzgkxpoyqauxdcjyaw antes de abrir SQL Editor.
2. Consultar uso/quotas do projeto e executar diagnostics/read-only-checks.sql. Guardar resultados.
3. Na saída das RPCs, confirmar assinatura exata:
   public.space_dm_start(p_peer uuid)
   public.space_dm_list_conversations()
   public.space_save_channel(p_channel uuid, p_name text, p_kind text, p_category uuid, p_private boolean, p_members uuid[])
   As três devem ser SECURITY DEFINER e EXECUTE deve estar autorizado a authenticated, não anon.
4. Se space_dm_* tables/RPCs não existirem, revisar e executar primeiro o arquivo 20261031 no SQL Editor do projeto correto. Preserve RLS. Depois executar 20261101 para validar assinatura/permissões e atualizar o cache PostgREST.
5. Se as funções já existirem com as assinaturas corretas e RLS/policies estiverem presentes, executar somente 20261101 para renovar grants e cache.
6. Se a migration 20261101 falhar com “RPC ausente”, não contorne. Aplique/revise a migration social 20261031 primeiro.
7. Recarregar o site (Ctrl+F5), inspecionar o JSON do 404 se persistir, testar criação/reabertura da mesma DM com 2 contas autorizadas, envio/recebimento, e negar leitura com uma terceira conta. Testar canal privado com conta sem membership.
8. Para confirmar capacidade, usar os relatórios/quota do Dashboard; não inferir “banco cheio” a partir dos 404.

EFEITO ESPERADO DAS MIGRATIONS
- 20261031: cria/ajusta esquema e policies do MSY Space social, incluindo DM com RLS por participante; concede RPCs apenas ao papel autenticado.
- 20261101: não altera conteúdo; valida a configuração existente, garante grants autenticados sem acesso anon/public e pede recarga do schema cache da API.
- Não há ação neste pacote para limpar dados, mudar plano, desativar RLS, usar service role no navegador ou executar alterações remotas automaticamente.

VALIDAÇÃO PENDENTE
Sem acesso ao Dashboard/SQL remoto e sem as contas de teste, não foi possível confirmar uso/quota atual, aplicação remota da migration, testar DMs de 2/3 contas ou provar que a assinatura recebeu eventos após reconexão. O arquivo de diagnóstico coleta evidências sem escrita. Depois da revisão, compare resultados e logs reais antes de decidir qualquer limpeza.

PRESERVAÇÃO
Nenhum dado remoto foi alterado. Não foi feito commit, push ou deploy. As cópias nesta pasta são para revisão/paste manual; as fontes canônicas permanecem em supabase/migrations. O stash existente e as demais alterações locais foram preservados.
