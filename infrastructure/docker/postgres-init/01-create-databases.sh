#!/bin/bash
set -e
# Create the test database and the shadow database used by `pnpm db:drift`
# and `prisma migrate dev`. Names match .env.example.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE biotrakr_test;
    CREATE DATABASE biotrakr_shadow;
    GRANT ALL PRIVILEGES ON DATABASE biotrakr_test TO $POSTGRES_USER;
    GRANT ALL PRIVILEGES ON DATABASE biotrakr_shadow TO $POSTGRES_USER;
EOSQL

echo "Databases created successfully!"
