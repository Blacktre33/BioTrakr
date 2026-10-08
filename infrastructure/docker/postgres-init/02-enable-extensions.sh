#!/bin/bash
set -e
# Enable exactly the extensions declared in apps/api/prisma/schema.prisma
# (the baseline migration also creates them; this just makes fresh
# databases ready for `prisma migrate dev`). Adding extensions that the
# schema does not declare would show up as drift.
for db in "$POSTGRES_DB" biotrakr_test biotrakr_shadow; do
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<-EOSQL
    CREATE EXTENSION IF NOT EXISTS timescaledb;
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
EOSQL
done

echo "Extensions enabled successfully!"
