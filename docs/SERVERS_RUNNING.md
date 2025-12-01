# BioTrakr Servers Status

**Last Updated:** November 18, 2025, 9:50 PM IST

## ✅ All Services Running

### Docker Services
| Service | Status | Port | Health |
|---------|--------|------|--------|
| **PostgreSQL** (TimescaleDB) | ✅ Running | 5433 | Healthy |
| **Redis** | ✅ Running | 6379 | Healthy |
| **Meilisearch** | ✅ Running | 7700 | Running |

### Application Servers
| Service | Status | Port | URL |
|---------|--------|------|-----|
| **Web Server** (Next.js) | ✅ Running | 3000 | http://localhost:3000 |
| **API Server** (NestJS) | ✅ Running | 3001 | http://localhost:3001 |

## Access URLs

- **Web Application:** http://localhost:3000
- **API Server:** http://localhost:3001
- **PostgreSQL:** localhost:5433
- **Redis:** localhost:6379
- **Meilisearch:** http://localhost:7700

## Quick Access

### Web Application
- **Home:** http://localhost:3000
- **Assets:** http://localhost:3000/assets
- **Asset Data Entry:** http://localhost:3000/assets/data-entry
- **Login:** http://localhost:3000/login

### API Endpoints
- **Health Check:** http://localhost:3001/api/v1/health
- **Assets API:** http://localhost:3001/api/v1/assets
- **Ingestion API:** http://localhost:3001/api/v1/pipeline/ingestion

## Service Details

### PostgreSQL (TimescaleDB)
- **Container:** medasset-postgres
- **Database:** medasset_dev
- **User:** postgres
- **Status:** Healthy and ready for connections
- **Extensions:** TimescaleDB enabled

### Redis
- **Container:** medasset-redis
- **Status:** Healthy
- **Mode:** Append-only file (AOF) enabled

### Meilisearch
- **Container:** medasset-search
- **Status:** Running
- **Ready for:** Search operations

### Web Server (Next.js)
- **Framework:** Next.js 16.0.1
- **Mode:** Development with hot reload
- **Status:** ✅ Fully operational
- **Features:** BioTrakr UI design system integrated

### API Server (NestJS)
- **Framework:** NestJS
- **Mode:** Development with watch mode
- **Status:** ✅ Running
- **Features:** 
  - Asset management
  - Telemetry ingestion
  - Excel import/export
  - Database: Prisma + PostgreSQL

## Notes

- All Docker services are healthy and running
- Web server is fully accessible with BioTrakr UI
- API server is running and ready for requests
- Both servers are running in watch mode (auto-reload on changes)

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

# Restart services
docker-compose restart
```

## Troubleshooting

If services are not responding:

1. **Check Docker services:**
   ```bash
   docker-compose ps
   ```

2. **Check application processes:**
   ```bash
   ps aux | grep -E "(nest|next)"
   ```

3. **Check ports:**
   ```bash
   lsof -i :3000 -i :3001
   ```

4. **Restart services:**
   ```bash
   docker-compose restart
   cd apps/api && pnpm dev &
   cd apps/web && pnpm dev &
   ```

