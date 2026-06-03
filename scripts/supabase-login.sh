#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export HOME="$ROOT_DIR/.supabase-home"
export XDG_CONFIG_HOME="$ROOT_DIR/.supabase-home/.config"
mkdir -p "$HOME" "$XDG_CONFIG_HOME"

cd "$ROOT_DIR"
./node_modules/.bin/supabase login

