#!/usr/bin/env bash
# Stop the EdTech stack. Pass --with-db to also stop PostgreSQL.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$HOME/.local/opt/pgsql/bin:$PATH"

for name in admin teacher student home backend; do
  pidfile="$ROOT/logs/$name.pid"
  [ -f "$pidfile" ] || continue
  pid="$(cat "$pidfile")"
  if kill -0 "$pid" 2>/dev/null; then
    kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null
    echo "stopped $name"
  fi
  rm -f "$pidfile"
done

# Fallback: kill watcher/vite processes that survive a child-process kill
pkill -f "node --watch src/server.js" 2>/dev/null && echo "stopped backend watcher"
pkill -f "node_modules/.bin/vite" 2>/dev/null && echo "stopped vite servers"

# Fallback: kill anything still holding the dev ports
for port in 4000 5170 5173 5174 5175; do
  fuser -k "${port}/tcp" >/dev/null 2>&1 && echo "freed port $port"
done

if [ "${1:-}" = "--with-db" ]; then
  pg_ctl -D "$HOME/.local/share/pgdata" stop -m fast >/dev/null 2>&1 && echo "stopped PostgreSQL"
fi
