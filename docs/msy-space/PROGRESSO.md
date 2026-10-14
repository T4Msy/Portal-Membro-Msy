# MSY Space — Progresso

> Diário do trabalho. Sempre registrar: o que foi feito, como foi verificado, o que falta.
> Visão geral e decisões: [README.md](README.md).

## Onde estamos
- **Fase 1 (banco):** ✅ concluída em 14/10/2026.
- **Fase 2 (porte da lógica de voz TS→JS):** ✅ arquivos gerados em `js/space/` (ainda não usados por nenhuma página).
- **Próximo:** permissões + item na sidebar + `space.html` com canais e chat de texto.

## Plano de fases
| Fase | Conteúdo | Status |
|---|---|---|
| 1 | Banco no Supabase do portal (tabelas `space_*`, RLS, realtime, salas com código, cron) | ✅ |
| 2 | Porte automático TS→JS da lógica de voz/WebRTC (`scripts/port-space.cjs`) | ✅ |
| 3 | Permissões `acessar_space`/`gerenciar_space`, aba na sidebar, `space.html`, canais + chat | ⏳ |
| 4 | Salas de voz na interface (entrar/sair, mutar, quem fala, tela, câmera, reações, volumes) | ⏳ |
| 5 | Chamada persistente: moldura com iframe + cartão flutuante ao navegar pelo portal | ⏳ |
| 6 | Salas com código, gestão de canais, preferências de dispositivos | ⏳ |
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
