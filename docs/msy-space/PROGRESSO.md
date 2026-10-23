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

## 17/10/2026 — Auditoria de erros do MSY Space + correções (pedido do dono: "procure todos os erros" → "resolva tudo")
- Verificado OK no ar: página sem erros no console, chat em tempo real entre abas, troca de canal fecha a conexão antiga,
  banco (RLS nas 5 tabelas, cron de limpeza ativo, sem salas órfãs, permissão `acessar_space` salvável).
- Corrigido (branch `fix/space-audit`, testado no Brave por injeção do commit):
  1. **Edição de mensagem perdia o texto** quando chegava mensagem nova (`ui/chat.js` redesenha a lista) → o rascunho,
     o cursor e o foco são guardados e restaurados a cada redesenho. Testado: texto e cursor ficaram, e salvou.
  2. **Presença global sem plano B** → `online.js` ganhou anúncios por broadcast (decisão D20). Testado com 2 abas:
     a aba "quebrada" anuncia, a outra passa a anunciar e vê a sala de voz dela; `bye` remove na hora.
  3. **Dado corrompido de categorias recolhidas travava o Space** → `ui/nav.js` lê com try/catch. Testado com valor inválido.
  4. **Última preferência perdida ao fechar a aba** → `prefs.js` grava com `fetch keepalive` ao sair/ir para o fundo
     (`flushOnExit`, só se houver mudança). Testado: resposta 200 e `updated_at` atualizado.
  5. **Voltar pelo "voltar" do navegador** deixava o Space sem tempo real → `pageshow` com `persisted` recarrega a página.
  6. **Trocar câmera ligada** usava atraso fixo de 400 ms → `voice.restartCamera()` desliga e liga em sequência.
  7. **Falha ao buscar o TURN** prendia a chamada 10 min só com STUN → nova tentativa em 30 s (`iceServers.js`
     + ajuste no `scripts/port-space.cjs` para não perder no próximo port).
  8. **Mensagem enviada usava a hora do aparelho para ordenar** → mensagens não confirmadas ficam sempre no fim.
  9. **"Apagar tudo" fazia os outros redesenharem 1x por mensagem** → DELETEs agrupados num desenho por quadro.
  - Extra: o indicador "carregando antigas" nunca aparecia (e ficava preso depois) → ordem corrigida em `loadOlder`.
- Ainda não testado na prática (precisa de 2 pessoas): compartilhar tela, câmera e navegar com a chamada ativa (moldura).

## 20/10/2026 — Câmera em tela cheia, quadro no formato da câmera, janela flutuante e permissões (pedido do dono)
- **Formato da câmera** (`ui/voice-room.js` `fitTile` + `css/space.css`): o quadro lê `videoWidth/videoHeight` do vídeo
  (`loadedmetadata`/`resize`) e vira de pé (`is-portrait`, `--sp-ar`) ou deitado; o vídeo usa `contain` (câmera inteira).
- **Tela cheia por pessoa**: botão no canto do quadro com câmera (ou dois cliques). No celular Android a tela gira para o
  formato da câmera (`screen.orientation.lock`), e gira de novo se a pessoa virar o celular. iPhone: tela cheia do próprio
  vídeo (`webkitEnterFullscreen`), gira pelo sensor. A tela cheia da transmissão também gira.
- **Janela flutuante da chamada** (`ui/call-pip.js`, botão nos controles da sala e no cartão flutuante):
  - Chrome/Edge/Brave no computador: Document Picture-in-Picture = mini sala com câmeras, quem fala e botões
    (microfone, som, câmera, sair). Fechar a janelinha não sai da chamada; sair da chamada fecha a janelinha.
  - Celular/Safari/Firefox: a mini sala é desenhada num canvas → vídeo em PiP; no Chrome os botões de microfone,
    câmera e desligar aparecem na janelinha (Media Session `togglemicrophone`/`togglecamera`/`hangup`).
  - `enterpictureinpicture` registrado: o Chrome pode abrir a janela sozinho ao sair da aba durante a chamada
    (ele pergunta uma vez — é a "permissão" que o navegador tem). A permissão do Android "sobrepor a outros apps" só
    existe para app instalado → fica para o app Android do Space.
- **"Pede permissão toda vez"** (`ui/permissions.js`): o site não consegue marcar "permitir sempre" — quem decide é o
  navegador. Agora: antes da janela do navegador aparecer, um aviso diz qual opção escolher ("Permitir ao visitar o site";
  iPhone: aA → Ajustes do Site → Permitir). Nas configurações de voz há a seção **Permissões** (estado de microfone e
  câmera, botão "Permitir sempre" que pede os dois numa pergunta só, e como desbloquear quando bloqueado).
- Testado no Brave (injeção do commit, câmera falsa de canvas — nada real capturado, sala temporária apagada depois):
  quadro de pé 360×640 e deitado 640×360, tela cheia com `contain`, janela flutuante com vídeo e 4 botões (mutar pela
  janelinha funcionou), canvas do modo celular desenha câmera e avatar, seção de permissões e aviso, sem erros.
- **Falta testar em celular real:** giro automático em tela cheia (Android), PiP de vídeo no Android/iPhone e a chamada
  continuando com o app em segundo plano (iPhone pode pausar o microfone fora do Safari).

## 20/10/2026 — Celular saindo do site (relato do dono: Android "não arrumou nada", iPhone câmera preta mas ouve)
- Causa: no celular o **sistema** corta microfone/câmera de site em segundo plano (já comprovado na Plataforma, TESTES 3.10).
  Solução definitiva no Android = app nativo (próxima etapa). No site, melhorias (branch `fix/space-mobile-background`):
  - `ui/dom.js` `liveCamera()`: câmera pausada/encerrada (faixa `muted`/`ended`) mostra a foto em vez de quadro preto
    (sala e janela flutuante).
  - `voice-controller.js` `onHidden/onVisible`: ao voltar para o site, pega o microfone de novo se o sistema encerrou,
    religa a câmera se estava ligada e, se a chamada caiu enquanto estava fora (e a pessoa não saiu de propósito), entra
    de novo na mesma sala.
  - `lib/supabase.js`: `realtime.worker = true` (sinal de vida do Supabase num Web Worker; timers da página em segundo
    plano são atrasados pelo navegador e o socket caía). Testado no Brave: conectado após 40 s, canais `joined`.
  - Janela flutuante falhou no Android → aviso de onde liberar (Configurações → Apps → Chrome → Picture-in-picture).
- Incidente no teste: injetei o código numa aba do Brave onde o dono tinha entrado na Sala Geral (a tela da chamada sumiu).
  Avisado; dono liberou recarregar. **Regra: antes de injetar, conferir se a aba não tem chamada ativa** (usar aba nova).

## 20/10/2026 — App Android do MSY Space 0.1 (pedido do dono: "os dois" — melhorar o site e fazer o app)
- Criado `mobile/` (cópia adaptada do app Masayoshi 0.9, que já tinha segundo plano, PiP, câmera e orientação).
  Detalhes, build e instalação: [APP_ANDROID.md](APP_ANDROID.md).
- Adaptações: banco do portal (`mobile/src/lib/config.ts`), login por e-mail do portal, acesso por `space_can_access()`,
  tabelas/RPCs `space_*`, presença `space:online` (com `sessionId`/`joinedAt`, igual ao site), link
  `space.html?sala=CODIGO`, cores do Space, botão alto-falante × "do ouvido", id `site.portalmsy.space`, nome "MSY Space".
- A camada WebRTC é a MESMA do site (`js/space/voice/webrtc`) via `mobile/metro.config.js` (troca o `lib/supabase.js`
  do site pelo cliente do app). Pacote JS gerado e conferido: tópico `space:voice:`, sem `window.MSY`, projeto do portal.
- `.vercelignore` com `mobile/` (o código do app não vai para o site).
- APK gerado (`npm run build:apk`, 2 min 25 s, 47 MB, ARM). Testado no emulador (versão x86 só para teste): abre na tela
  de login do MSY Space, sem erros. **Falta teste real** com login e chamada num celular (não dá para logar sem a senha).

## 20/10/2026 — Grade da chamada centralizada "igual ao Discord" (print do dono: quadros grudados no canto)
- `ui/voice-room.js` `layoutGrid()` + `.sp-tile-grid` em flex centralizado: todos os quadros com a **mesma altura**,
  largura = formato da câmera (em pé estreito, deitado largo, sem câmera 16:9), no **maior tamanho que cabe** na área
  (busca binária simulando a quebra de linha do flex). Recalcula com `ResizeObserver` e quando uma câmera muda de formato.
- Testado no Brave (2 abas, câmeras falsas, sala temporária apagada): em pé 327×583 + deitada 1036×583 lado a lado e
  centralizadas; sem câmera, 2 quadros 682×384 no meio da tela.
- Quadro preto no print do dono: era a câmera do celular mandando imagem preta (saiu do navegador/câmera ocupada);
  o app Android resolve o segundo plano.

## 20/10/2026 — Câmera em HD + destaque "igual ao Discord" (pedido do dono: "qualidade HORRÍVEL" e clicar na câmera para ir pro grande)
- **Qualidade:** a câmera era capturada em 640×360 e enviada a 350 kbps com prioridade baixa e `contentHint='motion'`
  (o navegador sacrificava a nitidez). Agora 1280×720 a 30 fps, até 1,2 Mbps, prioridade média, sem `contentHint`
  (`voice/VoiceSession.js`, `voice/media/devices.js` + PATCHES em `scripts/port-space.cjs`; app: 1 Mbps, 720p).
  Testado: a câmera da outra aba chegou em 720×1280 (antes ficava no máximo 360×640).
- **Destaque:** clicar no quadro de alguém leva a pessoa para o centro grande; os outros (inclusive você) vão para a
  faixa de baixo. Clicar no grande ou apertar Esc volta para a grade; clicar em alguém da faixa troca o destaque.
  Os quadros mudam de lugar sem recriar o `<video>` (não pisca). Funciona também durante transmissão de tela.
- **Volume por pessoa** saiu do clique (agora é destaque): botão no canto do quadro ou botão direito/toque longo.
- Testado no Brave (2 abas, câmeras falsas 1280×720 e 720×1280, sala temporária apagada).

## 20/10/2026 — Câmera "invertida" + APK para baixar no Space (pedido do dono)
- "Quando a pessoa vê minha câmera, ela inverte": você se via ESPELHADO (prévia estilo selfie) e os outros te viam
  normal → parecia invertido. Agora a prévia não é espelhada por padrão (todos veem igual); opção "Espelhar minha
  câmera (só para mim)" nas configurações de voz (`mirrorCamera`). App: prévia sem espelho.
- Download do app dentro do Space: botão "Baixar app Android" + bucket privado `space-app` (SQL rodado no Brave;
  `select` confirmou bucket privado com limite 52428800). APK 0.3 enviado (SHA-256 conferido) + `latest.json`.
  Detalhes em [APP_ANDROID.md](APP_ANDROID.md#download-pelo-msy-space).

## 22/10/2026 — App 0.4 com visual "jeito do Discord" (pedido do dono, com o Discord de referência)
- Telas novas (lista de canais, folha "Entrar na voz", call, barra "Voz conectada", chat) — ver
  [APP_ANDROID.md](APP_ANDROID.md#telas-04-jeito-do-discord-com-as-cores-do-space). Ícones: `react-native-vector-icons`
  (Font Awesome 6, os do site). A call saiu da tela e foi para o `SpaceStore` (continua ao navegar).
- Conferido no emulador com dados de exemplo (lista, call, folha, chat). APK 0.4 publicado no bucket `space-app`
  (SHA-256 conferido, 50 MB). **Falta teste real** com login e call entre celular e site.

## 22/10/2026 — Encerrar salas com código pela lista (pedido do dono: "muito importante")
- Site (`ui/nav.js` `deleteRoom` + `.sp-ch-del`): lixeira ao lado de cada sala com código para quem criou ou para a
  gestão do Space (regra no banco: `space_delete_room`). Confirma, tira você da call se estiver nela e atualiza a lista.
  No computador a lixeira aparece ao passar o mouse; no celular fica sempre visível.
- App 0.5: lixeira na linha da sala, segurar a sala ou botão "Encerrar sala" na folha "Entrar na voz".
- Testado no site publicado: lixeira em "CineMsy 🎃🦇" e "Teste lixeira"; encerrei só a de teste → sumiu da lista e do
  banco; a "CineMsy" ficou. APK 0.5 publicado no bucket (SHA-256 conferido).
- Obs.: o jsDelivr falhou ao servir parte dos módulos na injeção de teste; o teste foi feito no site publicado.

## 22/10/2026 — Visual 2.0 do Space no PC (pedido do dono: "menos genérico, degradês, algo mexendo")
- Camada nova no fim de `css/space.css` ("VISUAL 2.0"):
  - fundo vivo: nebulosa roxa/rosa/azul que deriva devagar (`body::before`) + estrelas que piscam e andam (`body::after`);
  - logo da coluna flutuando com anel em degradê girando (gira só as cores via `@property --sp-a`, a forma fica parada);
  - painéis de vidro em degradê, linha de luz correndo sob os cabeçalhos, marca "MSY Space" em degradê;
  - canais com barrinha em degradê que cresce e desliza no hover; canal ativo com brilho; "Criar sala" com brilho
    passando; quem fala na lista pulsa em verde;
  - call: quadros entram animados, sobem no hover, quem fala ganha anel verde girando; controles numa cápsula de vidro
    flutuante; botões ligados em degradê; botão "Entrar na sala" verde em degradê; orbe da sala com órbitas girando;
  - chat: campo de mensagem com brilho ao focar, botão enviar em degradê, barras de rolagem roxas.
- Regras: só transform/opacity nas animações pesadas; animações contínuas fora da lista de canais (ela é redesenhada a
  cada fala e reiniciaria); menos efeitos no celular; tudo desliga com "reduzir movimento" do sistema.
- Grade da call com 6px de folga (o brilho/anel não cria barra de rolagem; `layoutGrid` desconta).
- Testado no Brave (CSS do commit aplicado no site publicado + call de teste com câmera falsa; sala apagada depois).

## 22/10/2026 — Download do app vira ícone ao lado de "MSY Space" (pedido do dono, com print)
- O cartão grande "Baixar app Android" saiu da coluna de canais. No lugar: ícone de download (com bolinha verde) ao
  lado da marca; ao clicar abre a janela `openAppDownload()` (`ui/app-download.js`): versão/tamanho/data (de
  `latest.json`), o que o app faz, como instalar e o botão "Baixar app". Não aparece no iPhone.
- Testado no site publicado: ícone no cabeçalho, janela com "Versão 0.5 · 48 MB · 22/10/2026", sem o cartão antigo.
