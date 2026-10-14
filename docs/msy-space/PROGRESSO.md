# MSY Space — Progresso

> Diário do trabalho. Sempre registrar: o que foi feito, como foi verificado, o que falta.
> Visão geral e decisões: [README.md](README.md).

## Onde estamos (14/10/2026)
- Código na branch **`msy-space`** (ainda NÃO está no `main`/site).
- Banco ✅ · porte da voz ✅ · interface (canais, chat, sala de voz, cartão flutuante, moldura) ✅ escrita.
- Testado no portal real (injetando os arquivos da branch no Brave do dono): canais, chat (enviar/link/apagar)
  e entrada na sala OK. **Falta:** chamada entre 2 pessoas, tela/câmera, moldura navegando com chamada ativa.
- **Próximo:** publicar no `main` (só diretoria vê) e testar uma chamada real com 2 pessoas.

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

Limitações conhecidas:
- Sem TURN no portal (a função `turn-credentials` não existe aqui; o código cai para STUN sozinho).
- Na moldura, só cliques em links são capturados; códigos do portal que fazem `window.location = ...` na janela
  principal mostram o aviso "sair da página encerra a chamada".
