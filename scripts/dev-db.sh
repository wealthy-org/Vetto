#!/usr/bin/env bash
# Local Postgres for wallet sign-in, history and rate limiting.
#
# Kept out of the repo on purpose: the data directory lives in /tmp so a workspace
# snapshot never carries a 60 MB database. Re-running this script is safe — it starts
# a cluster only when nothing is listening, then applies migrations.
#
#   ./scripts/dev-db.sh          # start + create db + migrate
#   ./scripts/dev-db.sh --stop   # stop the cluster
#
# Override with PGDATA / PGPORT / VETTO_DB if needed.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGDATA="${PGDATA:-/tmp/vetto-pg}"
PGPORT="${PGPORT:-5432}"
PGUSER_LOCAL="${PGUSER_LOCAL:-vetto}"
DB="${VETTO_DB:-vetto}"
ENV_FILE="$REPO_ROOT/apps/web/.env.local"

find_pg_bin() {
  for dir in /usr/lib/postgresql/*/bin; do
    [ -x "$dir/pg_ctl" ] && echo "$dir" && return 0
  done
  command -v pg_ctl >/dev/null 2>&1 && dirname "$(command -v pg_ctl)" && return 0
  return 1
}

PG_BIN="$(find_pg_bin || true)"
if [ -z "$PG_BIN" ]; then
  cat <<'MSG'
PostgreSQL is not installed. Pick one:
  Debian/Ubuntu : sudo apt-get install -y postgresql
  macOS         : brew install postgresql@17 && brew services start postgresql@17
  Docker        : docker run -d --name vetto-pg -p 5432:5432 \
                    -e POSTGRES_USER=vetto -e POSTGRES_PASSWORD= -e POSTGRES_DB=vetto postgres:17
Then run this script again.
MSG
  exit 1
fi
export PATH="$PG_BIN:$PATH"

if [ "${1:-}" = "--stop" ]; then
  pg_ctl -D "$PGDATA" stop >/dev/null 2>&1 || true
  echo "stopped ${PGDATA}"
  exit 0
fi

if pg_isready -h 127.0.0.1 -p "$PGPORT" >/dev/null 2>&1; then
  echo "postgres already listening on 127.0.0.1:$PGPORT"
else
  if [ ! -f "$PGDATA/PG_VERSION" ]; then
    echo "initdb → $PGDATA (trust auth, loopback only)"
    mkdir -p "$PGDATA"
    initdb -D "$PGDATA" -U "$PGUSER_LOCAL" --auth=trust >/dev/null
  fi
  mkdir -p /tmp/vetto-pg-run
  pg_ctl -D "$PGDATA" -o "-k /tmp/vetto-pg-run -p $PGPORT -c listen_addresses=127.0.0.1" \
    -l /tmp/vetto-pg.log start >/dev/null
  for _ in $(seq 1 30); do pg_isready -h 127.0.0.1 -p "$PGPORT" >/dev/null 2>&1 && break; sleep 0.5; done
  pg_isready -h 127.0.0.1 -p "$PGPORT" >/dev/null
  echo "postgres started on 127.0.0.1:$PGPORT"
fi

createdb -h 127.0.0.1 -p "$PGPORT" -U "$PGUSER_LOCAL" "$DB" 2>/dev/null && echo "created database $DB" || echo "database $DB already exists"

URL="postgresql://${PGUSER_LOCAL}@127.0.0.1:${PGPORT}/${DB}"
touch "$ENV_FILE"
grep -q '^DATABASE_URL=' "$ENV_FILE" || echo "DATABASE_URL=$URL" >> "$ENV_FILE"
grep -q '^RATE_LIMIT_SALT=' "$ENV_FILE" || echo "RATE_LIMIT_SALT=$(openssl rand -hex 32)" >> "$ENV_FILE"

echo "applying migrations"
( cd "$REPO_ROOT/apps/web" && set -a && . "$ENV_FILE" && set +a && node scripts/migrate.mjs )

echo
echo "wallet sign-in is ready. Restart the app so it picks up the new env:"
echo "  ./scripts/dev-up.sh"
