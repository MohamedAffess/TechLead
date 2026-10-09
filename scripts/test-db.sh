#!/usr/bin/env bash
# Runs the migrations and the row-level security checks against a throwaway
# local Postgres. Needs Postgres 15+ binaries (initdb, pg_ctl, psql) on PATH,
# or PG_BIN pointing at them.
set -euo pipefail
cd "$(dirname "$0")/.."
PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")}"
DATA="$(mktemp -d)"
PORT="${PGPORT_TEST:-55432}"
trap '"$PG_BIN/pg_ctl" -D "$DATA" stop -m fast >/dev/null 2>&1 || true; rm -rf "$DATA"' EXIT
"$PG_BIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
"$PG_BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA" -l "$DATA/log" start >/dev/null
PSQL=(psql -h "$DATA" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -At)
"${PSQL[@]}" -f packages/db/test/supabase-stub.sql
for f in packages/db/supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
"${PSQL[@]}" -f packages/db/test/rls.sql 2>&1 | sed -n -e "s/.*NOTICE:  //p" -e "/ERROR/p"
echo "Database checks passed."
