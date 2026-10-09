#!/bin/sh
# Check the settings, bring the database schema up to date, then start
# whatever was asked for (the API by default). Migrations are idempotent and
# take a lock, so several API containers starting at once are safe.
set -e
node -e '
  try { new URL(process.env.DATABASE_URL || ""); }
  catch {
    console.error("DATABASE_URL is not a valid address. If DB_PASSWORD contains characters such as / @ : # ?, replace it with one made by:  openssl rand -hex 32  (and recreate the database volume if it already started).");
    process.exit(1);
  }'
if [ "${RUN_MIGRATIONS:-true}" = "true" ] && [ "$1" = "node" ] && [ "$2" = "dist/apps/api/src/main.js" ]; then
  echo "Applying database migrations..."
  ./node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma
fi
exec "$@"
