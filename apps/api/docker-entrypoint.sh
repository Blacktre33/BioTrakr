#!/bin/sh
# Bring the database schema up to date, then start whatever was asked for
# (the API by default). Migrations are idempotent and take a lock, so
# several API containers starting at once are safe.
set -e
if [ "${RUN_MIGRATIONS:-true}" = "true" ] && [ "$1" = "node" ] && [ "$2" = "dist/apps/api/src/main.js" ]; then
  echo "Applying database migrations..."
  ./node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma
fi
exec "$@"
