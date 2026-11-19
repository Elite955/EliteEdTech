#!/usr/bin/env bash
# Start the whole EdTech stack locally (Linux/macOS, no root needed).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$HOME/.local/opt/node-v26.13.1-linux-x64/bin:$HOME/.local/opt/pgsql/bin:$PATH"

PGDATA="$HOME/.local/share/pgdata"
PGSOCK="/tmp/opencode/pgsock"
mkdir -p "$ROOT/logs" "$PGSOCK"

# --- PostgreSQL ---------------------------------------------------------
if ! pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
  echo "Starting PostgreSQL..."
  pg_ctl -D "$PGDATA" -l "$ROOT/logs/postgres.log" \
    -o "-p 5432 -k $PGSOCK -c listen_addresses=127.0.0.1" start >/dev/null
  for _ in $(seq 1 20); do
    (exec 3<>/dev/tcp/127.0.0.1/5432) 2>/dev/null && break
    sleep 0.5
  done
fi
echo "PostgreSQL: ready"

# --- Apps ---------------------------------------------------------------
start_app() {
  local name="$1" dir="$2" port="$3"
  if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
    echo "$name: already running on $port"
    return
  fi
  ( cd "$ROOT/$dir" && setsid nohup npm run dev \
      > "$ROOT/logs/$name.log" 2>&1 < /dev/null &
    echo $! > "$ROOT/logs/$name.pid" )
  echo "$name: starting on $port"
}

start_app backend backend 4000
start_app home    home    5170
start_app admin   admin   5173
start_app teacher teacher 5174
start_app student student 5175

# wait for ports
for port in 4000 5170 5173 5174 5175; do
  for _ in $(seq 1 30); do
    (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null && break
    sleep 0.5
  done
done

echo
echo "  Public site:    http://localhost:5170"
echo "  Admin console:  http://localhost:5173"
echo "  Teacher portal: http://localhost:5174"
echo "  Student portal: http://localhost:5175"
echo "  API:            http://localhost:4000"
echo
echo "Logs: $ROOT/logs/"
