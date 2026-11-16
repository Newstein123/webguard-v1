#!/usr/bin/env bash
# Local dev stack: Supabase (Docker), the Next.js web app and the scan worker.
# Used by the Makefile: `make up`, `make stop`, `make down`, `make status`, `make logs`.
#
# Web and worker run in the background with PID files and logs in .run/.
# Stopping kills each process *tree*: `next dev` spawns a separate next-server
# process, and killing only the parent would leave the server running.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN="$ROOT/.run"
PORT="${PORT:-3000}"
mkdir -p "$RUN"
cd "$ROOT"

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
dim() { printf '\033[2m%s\033[0m\n' "$*"; }

# ── Node 22 ─────────────────────────────────────────────────────────────────
# The worker needs Node 22+ (supabase-js requires native WebSocket).
node_major() { "$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
find_node() {
  local want
  want="$(cat .nvmrc 2>/dev/null || echo 22)"
  for c in "${NODE:-}" node /usr/local/bin/node /opt/homebrew/bin/node; do
    [ -n "$c" ] && command -v "$c" >/dev/null 2>&1 || continue
    if [ "$(node_major "$c")" -ge "$want" ]; then command -v "$c"; return; fi
  done
  red "Node $want+ not found (\`node\` is $(node -v 2>/dev/null || echo missing))."
  red "Install it, run \`nvm use\`, or pass the path: make up NODE=/path/to/node"
  exit 1
}

# ── process helpers ─────────────────────────────────────────────────────────
alive() { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }
pid_of() { [ -f "$RUN/$1.pid" ] && cat "$RUN/$1.pid" || true; }

# PID plus all descendants, children first.
tree() {
  local child
  for child in $(pgrep -P "$1" 2>/dev/null); do tree "$child"; done
  echo "$1"
}

# SIGTERM the whole tree, wait up to $2 seconds, then SIGKILL what's left.
kill_tree() {
  local pid="$1" timeout="$2" pids p i
  pids="$(tree "$pid")"
  for p in $pids; do kill -TERM "$p" 2>/dev/null || true; done
  for ((i = 0; i < timeout * 4; i++)); do
    local any=0
    for p in $pids; do alive "$p" && any=1; done
    [ "$any" = 0 ] && return 0
    sleep 0.25
  done
  for p in $pids; do kill -KILL "$p" 2>/dev/null || true; done
}

stop_one() {
  local name="$1" timeout="$2" pid
  pid="$(pid_of "$name")"
  if alive "$pid"; then
    printf 'Stopping %s (pid %s)… ' "$name" "$pid"
    kill_tree "$pid" "$timeout"
    green "stopped"
  fi
  rm -f "$RUN/$name.pid"
}

# A next-server from *this* repo still holding the port (e.g. started outside make).
stray_web_pid() {
  local p
  for p in $(lsof -ti:"$PORT" -sTCP:LISTEN 2>/dev/null); do
    if [ "$(lsof -a -p "$p" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')" = "$ROOT" ]; then echo "$p"; return; fi
  done
}

wait_for() { # label, seconds, command...
  local label="$1" secs="$2" i
  shift 2
  for ((i = 0; i < secs * 2; i++)); do
    "$@" >/dev/null 2>&1 && return 0
    sleep 0.5
  done
  red "$label did not become ready in ${secs}s"
  return 1
}

# ── Supabase ────────────────────────────────────────────────────────────────
supabase_up() {
  if ! docker info >/dev/null 2>&1; then
    red "Docker is not running. Start Docker Desktop, then run make up again."
    exit 1
  fi
  if npx --no-install supabase status >/dev/null 2>&1; then
    dim "Supabase already running"
  else
    echo "Starting Supabase…"
    npx --no-install supabase start >"$RUN/supabase.log" 2>&1 || { red "supabase start failed, see .run/supabase.log"; tail -20 "$RUN/supabase.log"; exit 1; }
  fi
  # Apply any migrations added since the database was created (no-op if none).
  npx --no-install supabase migration up >"$RUN/migrate.log" 2>&1 || { red "Applying migrations failed, see .run/migrate.log"; tail -20 "$RUN/migrate.log"; exit 1; }
  dim "Migrations up to date"
}

# ── commands ────────────────────────────────────────────────────────────────
cmd_up() {
  local node
  node="$(find_node)"
  [ -f .env.local ] || { red ".env.local is missing. Copy .env.example and fill it in (see README)."; exit 1; }
  [ -d node_modules ] || { echo "Installing dependencies…"; npm install; }
  supabase_up

  # Web app
  if alive "$(pid_of web)"; then
    dim "Web already running (pid $(pid_of web))"
  else
    if lsof -ti:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
      red "Port $PORT is in use$( [ -n "$(stray_web_pid)" ] && echo ' by a dev server from this repo started outside make. Run `make stop` to stop it' || echo ' by another program')."
      exit 1
    fi
    echo "Starting web app…"
    nohup "$node" node_modules/next/dist/bin/next dev -p "$PORT" >"$RUN/web.log" 2>&1 &
    echo $! >"$RUN/web.pid"
    wait_for "Web app" 90 curl -sf -o /dev/null "http://localhost:$PORT/login" || { tail -20 "$RUN/web.log"; exit 1; }
  fi

  # Scan worker (rebuilt every start so it always matches the source)
  if alive "$(pid_of worker)"; then
    dim "Worker already running (pid $(pid_of worker))"
  else
    echo "Building and starting scan worker…"
    "$node" scripts/build-worker.mjs >"$RUN/worker-build.log" 2>&1 || { red "Worker build failed:"; cat "$RUN/worker-build.log"; exit 1; }
    nohup "$node" --env-file=.env.local --enable-source-maps dist/worker.mjs >"$RUN/worker.log" 2>&1 &
    echo $! >"$RUN/worker.pid"
    wait_for "Worker" 20 grep -q "polling for scans" "$RUN/worker.log" || { tail -20 "$RUN/worker.log"; exit 1; }
  fi

  echo
  cmd_status
  echo
  dim "Logs: make logs   ·   Stop: make stop   ·   Stop including Supabase: make down"
}

cmd_stop() {
  # The worker gets 30s to finish running scans; anything cut off is requeued later.
  stop_one worker 30
  stop_one web 10
  local stray
  stray="$(stray_web_pid)"
  if [ -n "$stray" ]; then
    printf 'Stopping dev server from this repo on port %s (pid %s)… ' "$PORT" "$stray"
    kill_tree "$stray" 10
    green "stopped"
  fi
}

cmd_down() {
  cmd_stop
  if npx --no-install supabase status >/dev/null 2>&1; then
    echo "Stopping Supabase (data is kept)…"
    npx --no-install supabase stop >/dev/null 2>&1
    green "Supabase stopped"
  fi
}

cmd_status() {
  local pid
  if npx --no-install supabase status >/dev/null 2>&1; then
    green "● Supabase   running   Studio http://127.0.0.1:54323 · Mail http://127.0.0.1:54324"
  else
    red "○ Supabase   stopped"
  fi
  pid="$(pid_of web)"
  if alive "$pid"; then green "● Web        running   http://localhost:$PORT (pid $pid)"
  elif [ -n "$(stray_web_pid)" ]; then red "● Web        running outside make on port $PORT (make stop will stop it)"
  else red "○ Web        stopped"; fi
  pid="$(pid_of worker)"
  if alive "$pid"; then green "● Worker     running   (pid $pid)"; else red "○ Worker     stopped"; fi
}

cmd_logs() {
  touch "$RUN/web.log" "$RUN/worker.log"
  tail -n 30 -f "$RUN/web.log" "$RUN/worker.log"
}

case "${1:-}" in
  up) cmd_up ;;
  stop) cmd_stop ;;
  down) cmd_down ;;
  status) cmd_status ;;
  logs) cmd_logs ;;
  *) echo "usage: $0 {up|stop|down|status|logs}"; exit 2 ;;
esac
