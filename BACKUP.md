# Backup do banco do Portal MSY

> Plano B caso o Supabase restrinja, caia por muito tempo ou o projeto se perca.
> Visão geral da infraestrutura: [`INFRAESTRUTURA.md`](INFRAESTRUTURA.md).

## O que é

Toda **semana** (domingo 03:00 de Brasília) o GitHub Actions faz um dump completo do banco do
Supabase e guarda **criptografado** no Cloudflare R2.

| | |
|---|---|
| Rotina | `.github/workflows/db-backup.yml` ("Backup do banco (Supabase -> R2)") |
| Onde fica | Cloudflare R2 (conta do Xitter) → bucket **`msy-backups`** (privado, sem acesso público, sem Worker) → pasta `db/` |
| Nome do arquivo | `db/msy-db-AAAA-MM-DD_HHMM.tar.gz.gpg` |
| Guarda por | **90 dias** (regra de ciclo de vida do bucket apaga os mais antigos sozinha) |
| Criptografia | GPG simétrico AES-256 com a senha `BACKUP_PASSPHRASE` |
| Tamanho | poucos MB (banco ~25 MB em 01/11/2026) |

**Dentro do arquivo** (`backup/`):
- `roles.sql` — papéis do Postgres
- `schema.sql` — tabelas, funções, policies (RLS), triggers
- `data.sql` — todos os dados
- `auth_storage_data.sql` — dados de `auth` (**logins**: e-mail + senha já criptografada pelo Supabase) e `storage` (metadados), à parte
- `LEIA-ME.txt` — data, projeto, commit do portal, versão do CLI

Com isso dá para subir o portal em **outro projeto Supabase** e todo mundo continua entrando
com o **mesmo e-mail e senha**.

**Não está no backup:** os arquivos em si (anexos, avatares, mídia — estão no R2 `msy-portal-media`,
fora do Supabase; atas e APK seguem no Supabase Storage), os Secrets das Edge Functions, as
configurações do painel do Supabase (Auth Redirect URLs, provedores, SMTP) e o código das Edge
Functions (esse está no repositório).

> ⚠️ O repositório é **público**. O dump **nunca** pode ir para o Git nem para artefatos do
> GitHub Actions sem criptografia — ele tem dados pessoais dos membros. Por isso ele é
> criptografado dentro do job e só o `.gpg` sai.

---

## Configuração (uma vez) — feita pelo Xitter

A rotina precisa de 4 *secrets* no GitHub: repositório → **Settings → Secrets and variables →
Actions → New repository secret**.

| Secret | De onde vem |
|---|---|
| `SUPABASE_DB_URL` | Supabase → botão **Connect** (topo) → **Session pooler** → copiar a URI e trocar `[YOUR-PASSWORD]` pela senha do banco. (Use o *Session pooler*: o GitHub não acessa o host direto, que é só IPv6.) Se não lembrar a senha: **Project Settings → Database → Reset database password** — o site não usa essa senha, então trocar não derruba nada. |
| `R2_ACCESS_KEY_ID` e `R2_SECRET_ACCESS_KEY` | Cloudflare → **R2 → Manage API tokens → Create API token** → permissão **Object Read & Write**, aplicada **só ao bucket `msy-backups`** → copiar *Access Key ID* e *Secret Access Key* (aparecem uma vez só). |
| `BACKUP_PASSPHRASE` | Uma senha longa inventada por você (ex.: 5–6 palavras aleatórias). **Guarde num gerenciador de senhas.** Sem ela os backups não abrem — nem o Supabase, nem o Cloudflare, nem ninguém recupera. |

Depois: **Actions → "Backup do banco (Supabase -> R2)" → Run workflow** para gerar o primeiro e
conferir em Cloudflare → R2 → `msy-backups` → `db/`.

> GitHub desativa rotinas agendadas de repositório público depois de **60 dias sem commits**.
> Se o portal ficar parado tanto tempo, reative em Actions (aparece um aviso amarelo).

---

## Como restaurar (emergência)

1. **Baixar** o backup mais recente: Cloudflare → R2 → `msy-backups` → `db/` → arquivo mais novo → Download.
2. **Abrir** (precisa do GPG — no Windows, Git Bash já vem com `gpg`):
   ```bash
   gpg --decrypt msy-db-AAAA-MM-DD_HHMM.tar.gz.gpg > msy-db.tar.gz
   tar -xzf msy-db.tar.gz
   ```
   Ele pede a `BACKUP_PASSPHRASE`.
3. **Criar o destino**: um projeto novo no Supabase (outra organização, se a atual estiver restrita),
   e copiar a URI do *Session pooler* dele.
4. **Carregar** (precisa do `psql`, versão 17+):
   ```bash
   psql --single-transaction --variable ON_ERROR_STOP=1 \
     --file backup/roles.sql \
     --file backup/schema.sql \
     --command 'SET session_replication_role = replica' \
     --file backup/data.sql \
     --dbname "postgresql://...novo-projeto..."
   ```
   Se depois disso ninguém conseguir entrar (tabela `auth.users` vazia), carregar também
   `backup/auth_storage_data.sql` com o mesmo comando (só esse arquivo, depois do `SET session_replication_role = replica`).
5. **Religar o resto**:
   - `js/config.js`: trocar `SUPABASE_URL` e `SUPABASE_ANON_KEY` pelos do projeto novo; publicar.
   - `cloudflare/media-worker/worker.js`: trocar `SUPABASE_URL` (o Worker valida o login pela JWKS
     do projeto) e republicar o Worker. Os arquivos continuam no R2 — nada a copiar.
   - Supabase novo: Auth → URL Configuration (Redirect URLs do `README.md`), Edge Functions
     (`supabase/functions/*`) e seus Secrets, extensões `pg_cron`/`pg_net` e o cron
     `storage-orphan-cleanup` (`supabase/migrations/20261101_storage_orphan_cleanup.sql`).
   - Rodar o checklist de `SMOKE_TESTS.md`.

Teste de restauração recomendado: uma vez por semestre, restaurar o backup mais recente num
projeto de teste e entrar com uma conta conhecida.
