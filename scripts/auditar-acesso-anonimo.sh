#!/usr/bin/env bash
# Lista as tabelas do portal que devolvem linhas SEM login (só com a chave anon pública).
# Tabela com dado de membro nunca deve aparecer aqui. Uso: bash scripts/auditar-acesso-anonimo.sh
# Só conta linhas (Prefer: count=exact); não baixa conteúdo.
set -euo pipefail
cd "$(dirname "$0")/.."
URL=$(grep -oE "SUPABASE_URL:\s*'[^']+'" js/config.js | sed -E "s/.*'([^']+)'/\1/")
ANON=$(grep -oE "SUPABASE_ANON_KEY:\s*'[^']+'" js/config.js | sed -E "s/.*'([^']+)'/\1/")
TABLES=$( { grep -rhoE "from\('[a-z_]+'\)" js ./*.html 2>/dev/null | sed -E "s/from\('([a-z_]+)'\)/\1/"
            grep -rhoiE "create table( if not exists)? (public\.)?[a-z_]+" --include=*.sql . | awk '{print $NF}' | sed 's/public\.//'; } | sort -u )
exposed=0
for t in $TABLES; do
  n=$(curl -s -I -G "$URL/rest/v1/$t" --data-urlencode "select=*" --data-urlencode "limit=1" \
      -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "Prefer: count=exact" \
      | tr -d '\r' | awk -F/ 'tolower($0) ~ /^content-range/ {print $2}')
  case "$n" in ""|0|"*") ;; *) echo "EXPOSTA sem login: $t ($n linhas)"; exposed=$((exposed+1));; esac
done
if [ "$exposed" -eq 0 ]; then echo "OK: nenhuma tabela devolve linhas sem login."; else echo "$exposed tabela(s) exposta(s)."; exit 1; fi
