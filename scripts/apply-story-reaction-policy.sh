#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export HOME="$ROOT_DIR/.supabase-home"
export XDG_CONFIG_HOME="$ROOT_DIR/.supabase-home/.config"
mkdir -p "$HOME" "$XDG_CONFIG_HOME"

PROJECT_REF="${SUPABASE_PROJECT_REF:-lldzgkxpoyqauxdcjyaw}"
SQL_FILE="$ROOT_DIR/supabase/migrations/20260603_story_reaction_delete_policy.sql"

cd "$ROOT_DIR"

if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  ./node_modules/.bin/supabase db query --db-url "$SUPABASE_DB_URL" --file "$SQL_FILE"
else
  ./node_modules/.bin/supabase link --project-ref "$PROJECT_REF"
  ./node_modules/.bin/supabase db query --linked --file "$SQL_FILE"
fi

