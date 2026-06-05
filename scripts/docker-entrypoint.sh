#!/bin/sh
set -e

if [ -n "${DATABASE_URL:-}" ]; then
  echo "Waiting for database..."
  attempt=1

  until npx prisma db execute --schema prisma/schema.prisma --stdin >/dev/null 2>&1 <<'SQL'
SELECT 1;
SQL
  do
    if [ "$attempt" -ge "${DATABASE_WAIT_ATTEMPTS:-30}" ]; then
      echo "Database is still unavailable after ${attempt} attempts."
      exit 1
    fi

    echo "Database unavailable, retrying in ${DATABASE_WAIT_INTERVAL_SECONDS:-2}s (${attempt}/${DATABASE_WAIT_ATTEMPTS:-30})..."
    attempt=$((attempt + 1))
    sleep "${DATABASE_WAIT_INTERVAL_SECONDS:-2}"
  done

  echo "Database is available."
fi

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  npx prisma migrate deploy
fi

exec "$@"
