# MSY Space — Progresso

> Diário do trabalho. Sempre registrar: o que foi feito, como foi verificado, o que falta.
> Visão geral e decisões: [README.md](README.md).

## Onde estamos (14/10/2026)
- ✅ **Publicado no `main`** (commit 52092bb) — https://www.portalmsy.site/space.html. Só diretoria + permissão `acessar_space` veem a aba.
- Conferido no site: `space.html` responde, abre imersivo, canais e presença OK.
- Observação: `js/app.js` fica até 1 h no cache do navegador (sem versão no nome); a aba "MSY Space" na sidebar
  pode demorar a aparecer → **Ctrl+F5** resolve na hora.
- **Próximo:** teste real de chamada entre 2 pessoas da diretoria (voz, tela, câmera, voltar ao portal com a chamada ativa).

## Plano de fases
| Fase | Conteúdo | Status |
|---|---|---|
| 1 | Banco no Supabase do portal (tabelas `space_*`, RLS, realtime, salas com código, cron) | ✅ |
| 2 | Porte automático TS→JS da lógica de voz/WebRTC (`scripts/port-space.cjs`) | ✅ |
| 3 | Permissões `acessar_space`/`gerenciar_space`, aba na sidebar, `space.html`, canais + chat | ✅ testado |
| 4 | Salas de voz na interface (entrar/sair, mutar, quem fala, tela, câmera, reações, volumes) | ✅ escrito · ⏳ teste com 2 pessoas |
| 5 | Chamada persistente: moldura com iframe + cartão flutuante ao navegar pelo portal | ✅ escrito · ⏳ teste |
| 6 | Salas com código ✅ (criar/usar código/link `?sala=`); gestão de canais pela tela ⏳; escolher microfone/saída ⏳ | parcial |
| 7 | Teste real com 2+ pessoas (mesma rede e redes diferentes) | ⏳ |
| 8 | App Android novo apontando para o portal | futuro |

---

## 14/10/2026 — Fase 1: banco
- Migration `supabase/migrations/20261014_msy_space.sql` aplicada pelo SQL Editor (Brave do dono).
- Antes, conferido no banco do portal:
  - nenhuma tabela `space_*`; nenhuma policy em `realtime.messages` (portal usa só canais públicos);
  - publicação `supabase_realtime` vazia (o portal não usava `postgres_changes`);
  - `public.has_permission(perm)` do portal **já considera a diretoria** e `member_permissions.permissions` (array);
  - `pg_cron` disponível (1.6.4) mas não instalado → a migration instala.
- Resultado verificado após rodar: 5 tabelas, 4 canais iniciais (#geral, #avisos, Sala Geral, Reunião),
  2 policies de realtime (`space_realtime_receive/send`), 4 tabelas na publicação, 1 job de cron.
- Diferenças em relação à Plataforma:
  - sem `roles`, cargos, convites, aprovação: perfis e permissões são os do portal;
  - canal privado usa lista de pessoas (`space_channel_members`) em vez de cargos;
  - preferências de voz em `space_preferences` (não mexe no `profiles` do portal);
  - tópicos realtime com prefixo `space:` (ver README).

## 14/10/2026 — Fase 2: porte da lógica de voz
- `scripts/port-space.cjs` converte 15 arquivos da Plataforma para `js/space/` (ES modules).
  Rodar: `node scripts/port-space.cjs <pasta-da-plataforma> js/space`.
- `js/space/lib/supabase.js` exporta o `db` do portal (mesma sessão, sem login próprio).
- Peças de React que serão reescritas em JS puro: VoiceProvider (cola sessão↔UI), OnlineProvider
  (presença global), preferências, telas (sidebar de canais, chat, sala de voz, controles).

## 14/10/2026 — Fase 3 a 5: interface em JS puro
Arquivos novos (todos em `js/space/`, ES modules):
| Arquivo | Papel |
|---|---|
| `space-app.js` | entrada da página: carrega tudo, escolhe canal (`#c=<id>`, último canal, `?sala=CODIGO`) |
| `workspace.js` | categorias, canais e perfis do portal; atualiza ao vivo (`space:workspace`) |
| `online.js` | presença global (`space:online`): quem está em qual sala (freio 15 s) |
| `prefs.js` | preferências de voz em `space_preferences` (grava agrupado) |
| `voice-controller.js` | cola sessão de voz ↔ tela (antigo VoiceProvider): sinal de vida da sala com código, sala vazia |
| `shell.js` | **chamada persistente**: links do portal abrem numa moldura (iframe) com a chamada viva |
| `ui/nav.js` | coluna de canais, quem está em cada sala (quem fala fica verde), criar sala/usar código, barra "Voz conectada" |
| `ui/chat.js` | canal de texto (otimista, reenvio, editar/apagar, apagar tudo p/ gestão, carregar antigas) |
| `ui/voice-room.js` | sala de voz: quadros, tela (abas, parar de assistir, tela cheia, janela flutuante PiP), controles, volumes 0–200%/0–300% |
| `ui/call-dock.js` | cartão flutuante da chamada (mutar, som, parar tela, abrir sala, sair, minimizar) |
| `ui/dom.js` | helpers (escapeHtml do portal, cor segura, avatar, datas, links) |
Outros: `space.html`, `css/space.css`, item na sidebar (`js/app.js`), permissões no catálogo (`js/modules3.js`),
`vercel.json` (`js/space/` sempre revalida, porque os módulos importam uns aos outros sem versão).

Como testei sem publicar: abri uma página do portal logado no Brave do dono e importei
`space-app.js` + `space.css` da branch pelo jsDelivr (`cdn.jsdelivr.net/gh/T4Msy/Portal-Membro-Msy@<commit>/...`).
- ✅ 4 canais carregados pelo RLS (diretoria), canais privados `space:online`/`space:workspace` conectaram.
- ✅ Chat: mensagem enviada, link clicável, apagada pelo botão (com confirmação).
- ✅ Sala: entrou, quadro próprio, contador 1/15, nome na lista da sala.
- Achado: com o microfone em "perguntar", a entrada espera a resposta do aviso do navegador → adicionado aviso
  "Se o navegador perguntar, permita o uso do microfone".
- Corrigido: grade quebrada no computador (fundo do menu do celular ocupava coluna), botões de celular aparecendo,
  "Novas mensagens" aparecendo escondido, borda amarela no campo de texto.

## 14/10/2026 — Experiência imersiva (pedido do dono)
- "Fazer igual a Supervisão, que você entra e parece que está entrando em outro lugar."
- `space.html` deixou de usar a sidebar/topbar do portal: tela cheia (`body.space-body`, `#spaceApp`), fundo
  espacial com estrelas, animação "Entrando no MSY Space" (mín. 0,9 s), coluna de ícones estilo Discord com a
  casinha "Voltar ao Portal" (no celular, a casinha fica no topo da lista de canais).
- Acesso conferido no próprio `space-app.js`: `Auth.requireAuth()` + `MSYTabAccess.canAccess('space')` → senão vai para o dashboard.
- Com chamada ativa, "Voltar ao Portal" abre o portal na moldura por cima da chamada (cartão flutuante continua).
- Testado no Brave (injeção da branch): animação ✅, layout ✅, presença entre abas ✅ (a aba de teste parada no
  aviso do microfone apareceu como "1 pessoa na sala"). Aviso "sair encerra a chamada" ao fechar a aba ✅.

Limitações conhecidas:
- Sem TURN no portal (a função `turn-credentials` não existe aqui; o código cai para STUN sozinho).
- Na moldura, só cliques em links são capturados; códigos do portal que fazem `window.location = ...` na janela
  principal mostram o aviso "sair da página encerra a chamada".

## 14/10/2026 — 1º teste real com 4G
- Sala Geral com 3 sessões (todas da conta Xitter): aba de teste (Brave do dono), outra aba no mesmo PC e um aparelho no 4G.
- Entre as duas abas do PC: **conectado** (0 ms, ~20 kbps de voz).
- Aparelho no 4G: **"Reconectando", 0 kbps** — não fecha a conexão P2P. Sem TURN, o 4G bloqueia a conexão direta (esperado).
- A Presença do Supabase não respondeu nessa sala; o **plano B por broadcast (beacons, D19) funcionou sozinho** — as sessões se enxergaram.
- Como foi observado sem entrar na sala: assinatura somente-leitura do canal `space:voice:<id>` (sem `track`) para ler
  beacons/sinais, e leitura dos quadros na aba de teste.
- **Próximo:** configurar TURN gratuito (ExpressTURN ou Metered Open Relay) — o dono cria a conta e coloca as credenciais
  nos Secrets; criar Edge Function no portal que entrega as credenciais só para `space_can_access()`.

## 14/10/2026 — TURN: função publicada
- `supabase/functions/turn-credentials/index.ts` publicada no Supabase do portal (painel, "Via Editor", Verify JWT ligado).
- Só entrega para quem passa em `space_can_access()`. Testado do portal logado: responde `{ iceServers: [], ttl: 0 }` (ainda sem secrets).
- O Space já chama essa função ao entrar numa sala (`js/space/voice/webrtc/iceServers.js`, cache de 10 min quando vazio).
- **Falta (dono):** criar os Secrets em Supabase → Edge Functions → Secrets:
  - ExpressTURN: `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL`; ou
  - Metered: `METERED_APP`, `METERED_API_KEY`.
- Depois: repetir o teste com alguém no 4G (o quadro mostra "TURN" quando a conexão passa pelo intermediário).

## 14/10/2026 — TURN funcionando (ExpressTURN, plano grátis)
- Secrets configurados pelo dono: `TURN_URLS=turn:free.expressturn.com:3478`, `TURN_USERNAME`, `TURN_CREDENTIAL`.
  **Atenção:** o servidor do plano grátis é `free.expressturn.com` (o `relay1` deu 401).
- Teste no portal logado: `RTCPeerConnection` com `iceTransportPolicy: 'relay'` gerou candidato **relay** → TURN aceito.
- Quem já estava com o Space aberto pode levar até 10 min para pegar o TURN (cache de `iceServers.js`); recarregar resolve.
- **Próximo:** repetir a chamada com alguém no 4G — o quadro da pessoa deve mostrar "TURN" nas estatísticas.

## 14/10/2026 — Configurações de voz e vídeo (pedido do dono, "igual ao Discord")
- `js/space/ui/settings.js`: escolher **microfone** (com barra de teste ao vivo), **saída de áudio** (com "Testar som"),
  **câmera** e processamento de voz (supressão de ruído, cancelamento de eco, volume automático). Vale no meio da chamada
  (`VoiceSession.changeInputDevice/changeOutputDevice`; câmera desliga/liga com a nova). Salvo em `space_preferences`.
- Abre pela engrenagem no painel do usuário (embaixo dos canais) e na barra de controles da chamada.
- **Celular:** o navegador não deixa o site escolher alto-falante × "do ouvido" (`setSinkId` indisponível ou sem lista).
  A tela explica e mostra só o que o navegador liberar. **Planejado para o app Android novo** (controle nativo de áudio).
- Testado no Brave (injeção da branch): 4 microfones + 8 saídas listados, sem erros. Corrigido: botão liga/desliga
  virava bolinha por causa da regra global do portal `input { min-height: 44px }`.

## 17/10/2026 — Painel do usuário estilo Discord (pedido do dono, com print do Discord)
- `js/space/ui/nav.js` (`userPanelHtml`): foto com bolinha de status (verde = disponível, roxo = em chamada), nome,
  **microfone e fone com setinha** que abre a lista de dispositivos de entrada/saída (troca na hora, inclusive em chamada),
  e atalho "Configurações de voz".
- Mutar/ensurdecer funcionam **fora da chamada** (como no Discord): ficam em `space_preferences` (`selfMute`/`selfDeaf`)
  e são aplicados ao entrar na sala (`voice-controller.js`).
- Sem permissão de microfone o navegador esconde os dispositivos → o menu mostra "Permitir acesso aos dispositivos".
- A branch `space-panel` foi juntada com o `main` (que tinha recebido melhorias do Space em outra sessão) sem conflitos.
- Corrigido: botões do painel ficavam com 44px de largura por causa da regra global do portal (alvo de toque) → nome espremido.
- Testado no Brave (injeção da branch): painel 48px por grupo, menu com o item de permissão, sem erros.
