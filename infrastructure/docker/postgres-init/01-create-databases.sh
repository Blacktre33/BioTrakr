#!/bin/bash
set -e
# Create test database
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE medasset_test;
    GRANT ALL PRIVILEGES ON DATABASE medasset_test TO $POSTGRES_USER;
EOSQL

echo "Databases created successfully!"
