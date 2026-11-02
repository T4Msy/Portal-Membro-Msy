# Infraestrutura do Portal MSY — Supabase + Cloudflare

> **Leia isto antes de mexer em upload, download, imagens, anexos, avatares ou Storage.**
> Desde **01/11/2026** o portal usa **dois provedores**: o **Supabase** guarda os dados e o login,
> e o **Cloudflare R2** guarda os arquivos. Este documento explica o porquê, como funciona
> e como mexer sem quebrar nada. Vale para pessoas e para qualquer IA que entrar no projeto.

---

## 1. Visão geral

| O quê | Onde fica | Por quê |
|---|---|---|
| Login, sessão, senha, autenticação (Supabase Auth) | **Supabase** | É o "porteiro" do portal; o Cloudflare confia nele |
| Banco de dados (perfis, atividades, eventos, feed, mensagens, permissões, mensalidades…) | **Supabase** (Postgres) | Dados importantes, RLS, funções SQL |
| Realtime (chat, notificações ao vivo, MSY Space) | **Supabase** | — |
| Edge Functions (e-mail, push, supervisão, TURN, limpeza) | **Supabase** | — |
| **Arquivos públicos**: anexos e respostas de atividades, avatares, fotos/vídeos/stories do feed, anexos do direct, mídia do Jornal, avatar/banner do MSY Space | **Cloudflare R2** (bucket `msy-portal-media`), servido pelo Worker `msy-media` | O R2 **não cobra download (egress)** |
| Arquivos **privados**: anexos de atas (`meeting-files`) e APK do Space (`space-app`) | **Supabase Storage** (links assinados) | Pequenos e pouco acessados; continuam como antes |
| Site (HTML/JS/CSS) | **Vercel** (push no `main` = deploy) | Sem mudança |

```
 Navegador (portalmsy.site)
   │
   ├── login / dados / realtime ─────────────►  Supabase  (lldzgkxpoyqauxdcjyaw)
   │                                              ▲
   │                                              │ (o Worker confere o login pela
   │                                              │  chave PÚBLICA do Supabase e pergunta
   │                                              │  "é diretoria?" com o token do usuário)
   └── enviar / ver / apagar arquivos ──────►  Cloudflare Worker  msy-media  ──►  R2  msy-portal-media
```

### Por que mudou

Em outubro/2026 o projeto (plano Free do Supabase) estourou a cota de **Cached Egress**:
**16,26 GB de 5 GB (325%)** no ciclo 18/10–18/11, e o ciclo anterior também tinha estourado.
O Supabase avisou que restringiria os projetos (erro 402) a partir de **23/11/2026**.
O que consumia era download de arquivos: avatares de 2–4 MB carregados em toda página,
vídeos de 20–48 MB abertos inteiros, prévias de vídeo que baixavam o arquivo todo, GIFs do Space.
O banco em si usa ~41 MB (8%). No R2 o download é grátis e ilimitado, então o problema some
sem mudar de plano.

---

## 2. Contas e acessos

| Serviço | Conta / identificação | Onde |
|---|---|---|
| **Supabase** | Projeto `lldzgkxpoyqauxdcjyaw` ("Member Portal"), organização *T4Msy's Org*, plano Free | [Dashboard](https://supabase.com/dashboard/project/lldzgkxpoyqauxdcjyaw) |
| **Cloudflare** | **Conta do Xitter** (subdomínio de Workers `miguelalvesmm08`), plano grátis do R2 com cartão cadastrado | [Dashboard](https://dash.cloudflare.com/d193b63f22591a6a947995231eea6ab4) |
| **Vercel** | Projeto do portal, deploy pelo push no `main` | — |

**Cloudflare — o que existe na conta:**
- **R2 bucket** `msy-portal-media` — acesso público **desligado** (só o Worker lê/escreve).
- **Worker** `msy-media` → `https://msy-media.miguelalvesmm08.workers.dev`, com o binding R2 `MEDIA` → `msy-portal-media`.
- Plano grátis do R2: 10 GB guardados, 1 milhão de escritas e 10 milhões de leituras por mês, **egress grátis**.
  Se passar, ele **cobra no cartão e continua funcionando** (não bloqueia como o Supabase Free).
  Uso em 01/11/2026: ~310 MB, cobrança US$ 0,00. **Alerta de cobrança** "MSY Portal - qualquer cobranca"
  criado em 01/11/2026: e-mail para o Xitter assim que a fatura passar de **US$ 1** (R2 → Billing Dashboard).

- **R2 bucket** `msy-backups` — privado; backups semanais **criptografados** do banco (pasta `db/`,
  apagados após 90 dias). Rotina e restauração: [`BACKUP.md`](BACKUP.md).

**Nenhum segredo fica no Cloudflare.** O Worker valida o login pela chave **pública** (JWKS) do
Supabase e, para saber se alguém é diretoria, chama o Supabase com o próprio token do usuário.
Segredos do backend (service role, Resend, Mercado Pago, VAPID) continuam só nos Secrets do Supabase.

> ⚠️ O subdomínio `miguelalvesmm08.workers.dev` está gravado nas URLs salvas no banco. Se um dia
> trocar o subdomínio ou colocar um domínio próprio (ex.: `arquivos.portalmsy.site`), é preciso
> rodar de novo um `replace` das URLs (veja `supabase/migrations/20261101_media_urls_to_r2.sql`
> como modelo) e atualizar `MEDIA_BASE_URL` em `js/core/media-store.js` e o `NETWORK_ONLY` do `sw.js`.

---

## 3. Como os arquivos funcionam agora

### 3.1 Caminhos e URLs

A chave no R2 é **`<bucket>/<caminho>`**, com **o mesmo caminho** que o Supabase Storage usava.
Só mudou o começo da URL:

```
antes:  https://lldzgkxpoyqauxdcjyaw.supabase.co/storage/v1/object/public/activity-files/<uid>/<...>/arquivo.pdf
agora:  https://msy-media.miguelalvesmm08.workers.dev/activity-files/<uid>/<...>/arquivo.pdf
```

Os "buckets" continuam existindo como **prefixos** dentro do único bucket R2:

| Prefixo | Conteúdo | Limite | Tipos |
|---|---|---|---|
| `activity-files/` | anexos e respostas de atividades; avatares em `activity-files/avatars/<uid>/` | 20 MB | qualquer |
| `social-media/` | posts, stories, direct, perfil social, imagem de atividade do feed | 50 MB | imagem e vídeo |
| `jornal-media/` | capas, fotos e vídeos do Jornal (só editores enviam) | 50 MB | imagem e vídeo |
| `space-profile-media/` | avatar e banner do MSY Space | 8 MB | imagem (inclui GIF) |

### 3.2 Worker `msy-media` — rotas

Código: `cloudflare/media-worker/worker.js` · config: `cloudflare/media-worker/wrangler.jsonc`

| Rota | Quem pode | O que faz |
|---|---|---|
| `GET/HEAD /<bucket>/<caminho>` | qualquer um (como era o bucket público) | entrega o arquivo; aceita `Range` (vídeo); `?download=nome` força baixar; `Cache-Control: immutable` de 1 ano |
| `PUT /<bucket>/<caminho>` | logado, **só no próprio caminho** (1º nível = seu id, ou `avatars/<seu id>`); Jornal exige diretoria ou `gerenciar_jornal` | envia arquivo; não sobrescreve (409) a menos que `x-upsert: true`; confere tamanho (413) e tipo (415) |
| `DELETE /<bucket>/<caminho>` | dono do caminho ou diretoria (Jornal: editores) | apaga |
| `POST /_import` `{bucket, path}` | diretoria | copia um arquivo do Supabase Storage para o R2 (usado na migração; não sobrescreve) |
| `POST /_cleanup[?dry=1]` | diretoria | limpeza de órfãos (ver §4) |

Login: o Worker valida o JWT ES256 do Supabase (`iss`, `aud=authenticated`, `exp`, assinatura pela JWKS
`/auth/v1/.well-known/jwks.json`). Papéis: chama `rpc/is_diretoria` e `rpc/has_permission(perm)` com o token
do usuário e o `apikey` que o próprio navegador manda.
CORS liberado para `portalmsy.site`, `www.portalmsy.site`, `*.vercel.app` e `localhost`.

### 3.3 No site — `js/core/media-store.js`

Cliente com **o mesmo formato** do `db.storage.from()` do Supabase:

```js
import { createMediaStorage, mediaPublicUrl, parseMediaUrl } from '../core/media-store.js?v=...';

const files = createMediaStorage(db).from('activity-files');
const { error } = await files.upload(path, file, { upsert: false, contentType: file.type, cacheControl: '31536000' });
const url = files.getPublicUrl(path).data.publicUrl;   // URL do Worker
await files.remove([path]);                             // apaga no R2 (e a cópia antiga no Supabase, se existir)

parseMediaUrl(url); // { bucket, path } — entende URL do R2 e URL antiga do Supabase
```

Scripts clássicos (`app.js`, `modules2.js`) carregam com `import()` dinâmico
(`_activityFiles()` / `_mediaStore()` em `app.js`, `feedMedia()` em `modules2.js`).
ES modules importam direto (`social_media.js`, `jornal.js`, `space/ui/profile.js`, `space/workspace.js`).

**Regra:** nunca use `db.storage.from()` para `activity-files`, `social-media`, `jornal-media` ou
`space-profile-media`. Para uma tela nova com upload, use `createMediaStorage(db).from(bucket)`,
monte o caminho começando pelo id do usuário (`${profile.id}/...`) e salve no banco a URL de
`getPublicUrl` (ou o caminho, como faz o Space).

### 3.4 Service Worker (`sw.js`) — cuidado

O `sw.js` faz cache-first de imagens **que não estão** na lista `NETWORK_ONLY`. O domínio do Worker
**precisa estar** nessa lista (como o Supabase sempre esteve). Na migração ele ficou de fora por
alguns minutos e o SW respondeu "Offline" 503 para todas as imagens do R2 — avatares e feed
quebraram até a correção (`3f0ac29`). O cache das imagens fica com o navegador
(`Cache-Control: immutable`). Ao mexer no `sw.js`, troque o `CACHE_VERSION`.

---

## 4. Limpeza automática de arquivos órfãos

"Órfão" = arquivo que **nenhuma tabela do schema `public` cita** (avatar trocado, resposta/atividade/
post/story/mensagem apagados, membro removido…). Comparação pelo **nome final do arquivo** contra o
texto de todas as linhas de todas as tabelas (`query_to_xml`). Duas rotinas, uma para cada lado:

| | Supabase Storage | Cloudflare R2 |
|---|---|---|
| Quem roda | Edge Function `storage-cleanup` | Worker `msy-media`, rota `POST /_cleanup` |
| Quando | `pg_cron` job `storage-orphan-cleanup`, todo dia **07:00 UTC (04:00 BRT)** via `pg_net` | quando alguém da **diretoria abre o portal** (`_scheduleMediaCleanup` em `app.js`, 8 s após carregar); o Worker só executa **1x a cada 20 h** (marcador `_meta/last-cleanup` no R2) |
| Função SQL | `public.storage_orphan_files(interval)` — só `service_role` | `public.media_unreferenced(text[])` — só **diretoria** (`is_diretoria()`), sem acesso anônimo |
| Auth | "Verify JWT" **desligado**; quem chama sem login só dispara a limpeza e recebe totais | JWT da diretoria |
| Travas | só > 7 dias · máx. 300 por vez · aborta se > 60% parecer órfão · ignora `space-app` | só > 7 dias (pela data de upload no R2) · máx. 300 · aborta se > 60% · só nomes `[A-Za-z0-9._-]` |
| Ver o que faria | diretoria: `POST` com `{ "dry": true }` | diretoria: `POST /_cleanup?dry=1` |
| Logs | Edge Functions → storage-cleanup → Logs | Cloudflare → Workers → msy-media → Logs |

Por que a do R2 não é um cron do Cloudflare: para chamar o banco sem usuário logado, o Worker
precisaria de uma chave guardada, ou a função SQL teria de ficar aberta para acesso anônimo
(ela lê o banco inteiro). Disparar pela sessão da diretoria evita os dois.

Observação: os ~210 arquivos copiados na migração têm data de upload **01/11/2026** no R2, então os
órfãos entre eles (~100, herdados do Supabase) só serão apagados a partir de ~08/11/2026.

---

## 5. Outras otimizações de tráfego (01/11/2026)

| Mudança | Onde | Efeito |
|---|---|---|
| Avatar comprimido no upload (máx. 384 px, WebP q0.85) | `app.js` (`_compressAvatar`, perfil do portal) e `feed.js` (perfil social) | 2–4 MB → 10–50 KB. Foto escolhida pode ter até 15 MB porque o que sobe é a comprimida |
| 5 avatares antigos recomprimidos | dados (feito pelo portal como diretoria) | 9,2 MB → 78 KB |
| Anexos de atividade: vídeo até 20 MB, demais até 10 MB | `app.js` (`_isActivityFileTooLarge`); Worker barra > 20 MB | arquivos menores; corrigido envio de arquivo recusado |
| **Jornal: versão leve das imagens** (02/11/2026) | `jornal.js` (`uploadJornalLightVariant`, `journalImgSrc`, `withLightVariants`), `app.js` (capa do dashboard via `pickLightImageUrl`), helpers em `media-store.js` (`lightVariantPath`, `lightVariantUrl`, `prefersLightMedia`) | Cada imagem enviada ao Jornal ganha, ao lado de `foto.webp` (até 2200 px), uma `foto.sm.webp` (800 px, ~3x menor). Quem está em **rede celular, 2G/3G ou com "Economia de dados"** recebe a leve; Wi-Fi recebe a original. **Tela cheia sempre usa a original.** Se a leve não existir (posts antigos), a `<img>` volta sozinha para a original (`onerror`). Limite: só navegadores que expõem `navigator.connection` (Chrome/Android); **iPhone e Brave** não expõem e sempre recebem a original. A limpeza do R2 trata `x.sm.webp` como parte de `x.webp`, e excluir uma imagem apaga as duas |
| Prévias de vídeo | `jornal.js`: card sem capa mostra ícone (antes baixava o vídeo); player com capa `preload="none"`. `feed.js`: vídeos e miniaturas com `preload="none"` + `IntersectionObserver` (`bindLazyVideoPreviews`) | vídeo só baixa perto da tela / no play |

---

## 6. Banco de dados — o que foi criado/alterado

Migrations em `supabase/migrations/` (aplicadas pelo SQL Editor do Supabase):

| Arquivo | O quê |
|---|---|
| `20261101_storage_orphan_cleanup.sql` | `storage_orphan_files()`, `pg_net`, cron `storage-orphan-cleanup` |
| `20261101_activity_files_limit_20mb.sql` | bucket `activity-files` com `file_size_limit` 20 MB |
| `20261101_media_urls_to_r2.sql` | troca as URLs do Supabase pelas do Worker em todas as colunas texto/json do `public` (pode rodar de novo) |
| `20261101_media_unreferenced.sql` | `media_unreferenced(text[])` para a limpeza do R2 |

Colunas que guardam URL de arquivo (todas apontam para o Worker desde a migração):
`profiles.avatar_url`, `profiles.social_avatar_url`, `profiles.banner_url`,
`activity_responses.file_url`, `activity_attachments.file_url`, `social_post_media.url`,
`social_stories.media_url`, `social_stories.thumbnail_url`, `direct_messages.attachment` (jsonb),
mais as tabelas do Jornal (`storage_path` + URL) e do Space (guarda só o caminho; a URL é montada
por `mediaPublicUrl`).

---

## 7. Como fazer tarefas comuns

**Publicar o site:** `git push origin main` (Vercel). Ao mudar um `.js`, **troque o `?v=`** nas páginas
que o carregam — a Vercel serve `.js` com `max-age=3600, stale-while-revalidate=86400`, então sem `?v=`
alguém pode ficar até 1 dia com o código velho.

**Publicar o Worker:** Cloudflare → Workers & Pages → `msy-media` → *Edit code* → colar
`cloudflare/media-worker/worker.js` → *Deploy*. (Ou `npx wrangler deploy` dentro de
`cloudflare/media-worker/`, depois de `wrangler login`.) Mantenha o arquivo do repositório igual ao publicado.

**Testar o Worker rápido:**
```bash
curl https://msy-media.miguelalvesmm08.workers.dev/            # {"ok":true,"service":"msy-media"}
curl -X POST https://msy-media.miguelalvesmm08.workers.dev/_cleanup   # 401 sem login
```

**Ver quanto o Supabase está consumindo:** Organization → Usage (filtrar por projeto). Logs de
download: Logs Explorer, `source = 'edge_logs'`, `log_attributes['request.path'] like '/storage/%'`.

---

## 8. Pendências e problemas conhecidos (01/11/2026)

- ~~Cópias antigas no Supabase Storage~~ — **resolvido em 02/11/2026**: conferido que não houve
  upload novo no Supabase depois da migração e que o banco não tem nenhuma URL antiga; o Xitter
  esvaziou `activity-files`, `social-media` e `space-profile-media` (Edit bucket → Empty bucket).
  Os buckets continuam existindo, vazios. No Supabase Storage sobraram só `meeting-files` e `space-app`.
- **34 registros apontam para arquivos que já não existiam antes da migração** (14 mídias de post,
  11 stories, 7 respostas de atividade, 2 anexos do direct). Ficam quebrados no site.
- **Bug provável na exclusão de anexo** (Atividades → Anexos, diretoria): apaga o arquivo e depois
  tenta limpar o `file_url` da resposta; se a RLS barrar o update, o link fica pendurado. Não investigado.
- **Cota do Supabase:** o ciclo 18/10–18/11 já fechou em 16 GB de cached egress; a carência vai
  até 23/11/2026. Com o R2 o próximo ciclo deve ficar perto de zero, mas pode haver restrição por
  alguns dias depois de 23/11. Upgrade para o Pro é a saída garantida se o portal não puder parar.
- Atas (`meeting-files`) e APK do Space (`space-app`) seguem no Supabase (privados).

---

## 9. Linha do tempo — 01/11/2026

| Commit | O quê |
|---|---|
| `ae7a0d7` | limpeza diária de órfãos no Supabase Storage |
| `9a02c04` | anexos de atividade limitados a 20 MB (vídeo) / 10 MB |
| `57d7599` | avatar comprimido (384 px WebP) |
| `8f97d42` | prévias de vídeo do Jornal e do feed sem download à toa |
| `e231136` | **arquivos públicos no Cloudflare R2** (Worker, `media-store.js`, troca dos uploads) |
| `3f0ac29` | correção do Service Worker (503 nas imagens do R2) + SQL de troca de URLs |
| `ec6a929` | limpeza de órfãos no R2 |

Fora do Git, no mesmo dia: R2 ativado e bucket/Worker criados (Cloudflare do Xitter); 210 arquivos
copiados do Supabase para o R2 (todos conferidos); 135 URLs trocadas no banco; `pg_net` ativado e cron
`storage-orphan-cleanup` criado; Edge Function `storage-cleanup` publicada com Verify JWT desligado;
bucket `activity-files` limitado a 20 MB; 5 avatares recomprimidos.
