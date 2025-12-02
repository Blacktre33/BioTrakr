# BioTrakr Servers Status

**Last Updated:** November 18, 2025, 9:21 PM IST

## ✅ Running Services

### Docker Services (via docker-compose)
| Service | Status | Port | Health |
|---------|--------|------|--------|
| **PostgreSQL** (TimescaleDB) | ✅ Running | 5433 | Healthy |
| **Redis** | ✅ Running | 6379 | Healthy |
| **Meilisearch** | ✅ Running | 7700 | Running |

### Application Servers
| Service | Status | Port | Process |
|---------|--------|------|---------|
| **Web Server** (Next.js) | ✅ Running | 3000 | Active |
| **API Server** (NestJS) | ⚠️ Starting | 3001 | Starting |

## Access URLs

- **Web Application:** http://localhost:3000
- **API Server:** http://localhost:3001
- **PostgreSQL:** localhost:5433
- **Redis:** localhost:6379
- **Meilisearch:** http://localhost:7700

## Service Details

### PostgreSQL (TimescaleDB)
- **Container:** biotrakr-postgres
- **Database:** biotrakr_dev
- **User:** postgres
- **Status:** Healthy and ready for connections

### Redis
- **Container:** biotrakr-redis
- **Status:** Healthy, append-only mode enabled

### Meilisearch
- **Container:** biotrakr-search
- **Status:** Running, ready for search operations

### Web Server (Next.js)
- **Status:** ✅ Fully operational
- **Framework:** Next.js 16.0.1
- **Mode:** Development with hot reload
- **Access:** http://localhost:3000

### API Server (NestJS)
- **Status:** ⚠️ Starting up (may take a few moments)
- **Framework:** NestJS
- **Mode:** Development with watch mode
- **Access:** http://localhost:3001

## Notes

- All Docker services are healthy and running
- Web server is fully accessible
- API server is starting - allow 30-60 seconds for full initialization
- Prisma Client has been generated successfully

## Next Steps

1. Wait for API server to fully start (check logs if needed)
2. Access the web application at http://localhost:3000
3. Test API endpoints at http://localhost:3001/api/v1/...

## Commands Reference

```bash
# Check Docker services
docker-compose ps

# View API logs
cd apps/api && pnpm dev

# View Web logs
cd apps/web && pnpm dev

# Stop all services
docker-compose down
```

