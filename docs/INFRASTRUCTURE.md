# Infrastructure Setup

## Local Development Services

### PostgreSQL (TimescaleDB)
- **Host**: localhost
- **Port**: 5433
- **Database**: medasset_dev
- **User**: postgres
- **Password**: postgres

**Connection String:**
```
postgresql://postgres:postgres@localhost:5433/medasset_dev
```

**Extensions:**
- TimescaleDB (time-series data)
- uuid-ossp (UUID generation)
- pgcrypto (cryptographic functions)

### Redis
- **Host**: localhost
- **Port**: 6379
- **No password** (development only)

**Connection String:**
```
redis://localhost:6379
```

### Meilisearch
- **Host**: localhost
- **Port**: 7700
- **Master Key**: masterKey

**API URL:**
```
http://localhost:7700
```

## Docker Commands

### Start all services
```bash
docker-compose up -d
```

### Stop all services
```bash
docker-compose down
```

### View logs
```bash
docker-compose logs -f [service-name]
```

### Restart a service
```bash
docker-compose restart [service-name]
```

### Clean up (removes volumes)
```bash
docker-compose down -v
```

## Optional Management UIs

Start with tools profile:
```bash
docker-compose --profile tools up -d
```

### pgAdmin
- URL: http://localhost:5050
- Email: admin@medasset.com
- Password: admin

### RedisInsight
- URL: http://localhost:8001

## Troubleshooting

### Port conflicts
If ports are already in use, edit `docker-compose.yml` and change the port mappings.

### Database connection issues
```bash
# Check if PostgreSQL is running
docker-compose ps postgres

# View logs
docker-compose logs postgres

# Restart PostgreSQL
docker-compose restart postgres
```

### Clear all data
```bash
docker-compose down -v
docker-compose up -d
```
