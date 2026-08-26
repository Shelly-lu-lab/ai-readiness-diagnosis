#!/bin/zsh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d node_modules ]; then
  npm install
fi

(sleep 2; open "http://localhost:5173") &
npm run dev
