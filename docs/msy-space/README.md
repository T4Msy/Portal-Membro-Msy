# MSY Space

O "Discord da Masayoshi" dentro do Portal de Membro: canais de texto, salas de voz,
compartilhamento de tela, câmera e reações. Nasceu do projeto separado
`C:\Users\migue\Projetos\Masayoshi-Plataforma` (React + TS) e foi trazido para o portal
na mesma linguagem do portal (JS puro, sem build).

> **Leia primeiro:** este arquivo (visão geral e decisões) e [PROGRESSO.md](PROGRESSO.md)
> (o que já foi feito, o que falta e onde paramos).

---

## Pedidos do dono (13/10/2026)

| # | Pedido | Como foi atendido |
|---|---|---|
| 1 | Usar o banco do portal | Tabelas novas com prefixo `space_` no Supabase do portal (`lldzgkxpoyqauxdcjyaw`) |
| 2 | Nome próprio | **MSY Space** (o visual vai evoluir para combinar com o nome) |
| 3 | Mesma linguagem do portal | JS puro. A lógica de chamada foi **convertida automaticamente** de TS para JS (ver "Porte") |
| 4 | App Android novo | Depois; primeiro o MSY Space no portal |
| 5 | Mesmo login do portal | Usa o `db` (cliente Supabase) e a sessão do portal. Sem cadastro/aprovação próprios |
| 6 | Chamada em sobreposição | A chamada continua enquanto a pessoa navega pelo portal (ver "Chamada persistente") |
| 7 | Acesso | Só **diretoria** + quem receber a permissão `acessar_space` em Permissões (surpresa para os membros) |
| 8 | Documentar tudo | Esta pasta `docs/msy-space/` |
| 9 | "Igual à Supervisão: parecer que entrou em outro lugar" | `space.html` imersiva: sem sidebar do portal, fundo espacial, animação de entrada, coluna de ícones com "Voltar ao Portal" |

## Arquitetura

```
space.html                 página imersiva do MSY Space (como supervisao.html: Auth.requireAuth + MSYTabAccess.canAccess('space'))
js/space/
  lib/supabase.js          ponte: exporta o `db` do portal (mesma sessão)
  lib/presenceThrottle.js  freio de presença (limite do Supabase: 5 updates/30 s)
  chat/mergeMessages.js    junta mensagens otimistas + realtime sem duplicar
  voice/VoiceSession.js    sessão de voz (mic, câmera, tela, reações, volumes)
  voice/media/*            microfone, câmera, tela, detecção de fala, saída de áudio
  voice/webrtc/*           PeerLink, MeshTransport, SignalingChannel, ICE, SDP
  ...                      (interface do Space — ver PROGRESSO.md)
css/space.css              estilos (escopo body[data-page="space"])
supabase/migrations/2026101x_msy_space*.sql
```

### Porte do código (TS → JS)
- Os módulos sem React da Plataforma (WebRTC, mídia, sessão de voz) foram convertidos com o
  compilador do TypeScript (`transpileModule`): tipos removidos, **lógica e comentários
  preservados**. Script: `scripts/port-space.cjs` (rodar de novo se a Plataforma mudar).
- Cada arquivo portado começa com `// Portado de Masayoshi-Plataforma/src/...`.
- As partes de React (telas) foram **reescritas** em JS puro no padrão do portal.
- São ES modules (`<script type="module">`), como o `js/pages/feed.js` do portal.
  O `db` global do `app.js` é lido pelo módulo `lib/supabase.js`.

### Banco (Supabase do portal)
Tudo com prefixo `space_` para não colidir com tabelas/funções do portal
(o portal já tem `profiles`, `has_permission`, etc.).
- Acesso: `space_can_access()` = diretoria **ou** permissão `acessar_space`.
- Gestão (criar/editar canais, apagar mensagens dos outros): `space_can_manage()` = diretoria
  **ou** permissão `gerenciar_space`.
- A identidade e autenticação continuam em `public.profiles` do Portal; os dados sociais editáveis do Space ficam em `public.space_profiles` e no bucket `space-profile-media` (`20261023_msy_space_profiles.sql`). O Space combina os dois em memória; nunca grava alterações em `public.profiles`.
- Detalhes na migration e em PROGRESSO.md.

### Realtime (tópicos privados, autorizados por RLS em `realtime.messages`)
| Tópico | Uso |
|---|---|
| `space:online` | presença global: quem está no Space e em qual sala de voz |
| `space:chat:<canal>` | mensagens novas de um canal de texto |
| `space:voice:<canal>` | sinalização WebRTC + presença da sala de voz |

## Decisões herdadas da Plataforma (NÃO desfazer sem ler)
Resumo de `Masayoshi-Plataforma/docs/DECISOES.md` e `WEBRTC.md`:
- **D7** 4 transceivers fixos por conexão (mic, câmera, tela, áudio da tela); ligar/desligar = `replaceTrack`.
- **D15** "Um lado oferece": o iniciador (sessionId maior) cria os 4 transceivers `sendrecv` e oferece; o slot vem do `mid`.
- **D18** Presença com freio (10 s na sala, 15 s no online); mudanças imediatas vão por broadcast `meta` com `rev`.
- **D19** Se a Presença do Supabase falhar, cada sessão se anuncia por broadcast `beacon` (10 s, validade 30 s, `bye` ao sair).
- **D20** O mesmo plano B do D19 vale para a presença global `space:online` (`online.js`): lista de canais e tela de entrada
  continuam mostrando quem está em cada sala mesmo com a Presença do Supabase fora do ar.
- **D8** "Parar de assistir" a tela economiza a banda de quem transmite.
- Sem TURN (o da Cloudflare pede cartão): quem está em CGNAT/4G restritivo pode não conectar.
- P2P mesh: bom para voz com até ~15 pessoas; tela para muitos espectadores pesa no upload de quem transmite.

## Chamada persistente (sobreposição)
O portal é multipágina: trocar de aba recarrega a página e mataria a chamada. Solução:
- Ao navegar pelo portal **durante uma chamada**, o MSY Space vira uma "moldura":
  a janela principal mantém a chamada e mostra as outras páginas do portal num `iframe`
  de tela cheia. Um cartão flutuante da chamada fica por cima (mutar, sair, voltar ao Space).
- Mesmo domínio → a sessão de login é a mesma; as páginas não precisam mudar.
- Ao sair da chamada, a moldura some e a página atual vira a página normal de novo.
- Fechar/recarregar a aba pede confirmação enquanto houver chamada.

## Recursos sociais e canais privados (31/10/2026)

- A lista de participantes e os quadros da chamada abrem o menu por clique direito; o botão de opções funciona em toque e teclado. O cartão reutiliza `ui/profile.js`. O volume remoto é associado ao `userId` do participante, mantido nas `space_preferences` do usuário local, em 100% por padrão e de 0% a 200%. O áudio de compartilhamento continua com controle separado (até 300%).
- Canais permanentes de texto e voz usam `space_channels`, `space_categories` e `space_channel_members`. Criar, editar e administrar membros exige `gerenciar_space`: diretoria ou membro que recebeu a permissão no painel **Permissões**. A ação só aparece para quem pode administrar, mas a RPC também valida no banco.
- Canais privados só aparecem e aceitam mensagens, voz e tópicos Realtime para a gestão e os membros da lista autorizada. A presença global não anuncia IDs de salas privadas; a presença da chamada é recebida pelo tópico privado da sala.
- DMs são individuais. `space_dm_conversations`, `space_dm_participants` e `space_dm_messages` têm políticas RLS; `space_dm_start` impede DM consigo mesmo e só permite abrir conversa com membro ativo que também tenha acesso ao MSY Space. `space:dm:<id>` é limitado aos participantes; `space:dm-inbox:<user_id>` só autoriza o próprio usuário e as linhas continuam filtradas por RLS.
- Migração local a revisar: `supabase/migrations/20261031_msy_space_channels_dm.sql`. Ela não é aplicada automaticamente. Depois de aprovação, executar manualmente no SQL Editor conectado ao Supabase do portal.
- Depois dela, `supabase/migrations/20261101_msy_space_rpc_realtime_cache.sql` valida a existência, assinatura e permissão das RPCs de DM/canais e solicita recarga do cache PostgREST. Se a verificação disser que uma RPC está ausente, aplicar primeiro a migration social de 31/10; não executar a corretiva isoladamente.
- Limitações atuais: DMs não têm notificações externas, anexos, indicadores de leitura, busca no texto nem edição/remoção. O recebimento em tempo real depende da conexão do Supabase.
- A autorização Realtime é verificada ao entrar no tópico e pode ficar em cache durante a assinatura; clientes atualizados recebem o aviso genérico de alteração de membros e recarregam a estrutura para sair dos tópicos sem acesso. A revogação imediata de clientes antigos ou adulterados depende de reconectar/renovar a autorização Realtime.
