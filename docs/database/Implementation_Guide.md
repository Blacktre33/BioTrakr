# BioTrakr Database Implementation Guide
## Version 2.0 - November 8, 2025

---

## 📋 TABLE OF CONTENTS

1. [Prerequisites](#prerequisites)
2. [Installation Steps](#installation-steps)
3. [Configuration](#configuration)
4. [Data Migration Strategy](#data-migration-strategy)
5. [Performance Tuning](#performance-tuning)
6. [Backup & Recovery](#backup-recovery)
7. [Security Hardening](#security-hardening)
8. [Monitoring & Maintenance](#monitoring-maintenance)
9. [Common Operations](#common-operations)
10. [Troubleshooting](#troubleshooting)

---

## 🔧 PREREQUISITES

### Required Software

| Software | Minimum Version | Recommended | Purpose |
|----------|----------------|-------------|---------|
| Node.js | 20.0.0 | 20.10+ | Runtime |
| pnpm | 8.0.0 | 8.10+ | Package manager |
| PostgreSQL | 15.0 | 16.0+ | Core database |
| TimescaleDB | 2.11 | 2.13+ | Time-series extension |
| Docker | 24.0 | Latest | Containerization |
| Prisma CLI | 5.0 | Latest | ORM tooling |

### Hardware Requirements

**Development Environment:**
- CPU: 4 cores
- RAM: 8 GB
- Storage: 50 GB SSD
- Network: 100 Mbps

**Production Environment (Single Facility - 1,000 assets):**
- CPU: 8 cores (16 vCPUs)
- RAM: 32 GB
- Storage: 500 GB SSD (NVMe preferred)
- Network: 1 Gbps
- Backup Storage: 1 TB

**Production Environment (Multi-Facility - 50,000 assets):**
- CPU: 16-32 cores
- RAM: 128-256 GB
- Storage: 2-5 TB NVMe SSD (RAID 10)
- Network: 10 Gbps
- Read Replicas: 2-3 instances
- Backup Storage: 10 TB

---

## 🚀 INSTALLATION STEPS

### Step 1: Start Infrastructure

```bash
# From project root
cd /Users/saketh/BioTrakr

# Start PostgreSQL with TimescaleDB and other services
docker-compose up -d postgres redis meilisearch

# Verify services are running
docker-compose ps
```

### Step 2: Configure Environment Variables

```bash
# apps/api/.env
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/biotrakr_dev?schema=public"
SHADOW_DATABASE_URL="postgresql://postgres:postgres@localhost:5433/medasset_test?schema=public"
```

### Step 3: Apply Prisma Migrations

```bash
cd apps/api

# Generate Prisma Client
pnpm prisma generate

# Apply migrations
pnpm prisma migrate dev --name comprehensive_schema

# Or if starting fresh, reset the database
pnpm prisma migrate reset
```

### Step 4: Enable TimescaleDB Features

```bash
# Run TimescaleDB-specific SQL (hypertables, compression, etc.)
pnpm prisma db execute --file prisma/migrations/timescaledb-setup.sql

# Verify TimescaleDB installation
docker exec biotrakr-postgres psql -U postgres -d biotrakr_dev -c "\dx"
```

### Step 5: Seed Database (Optional)

```bash
# Run seed script
pnpm prisma db seed

# Or create custom seed data
pnpm ts-node prisma/seed.ts
```

### Step 6: Verify Installation

```bash
# Open Prisma Studio to explore data
pnpm prisma studio

# Check database tables
docker exec biotrakr-postgres psql -U postgres -d biotrakr_dev -c "\dt"

# Verify TimescaleDB hypertables
docker exec biotrakr-postgres psql -U postgres -d biotrakr_dev -c "SELECT * FROM timescaledb_information.hypertables;"
```

---

## ⚙️ CONFIGURATION

### Prisma Configuration

**prisma/schema.prisma:**
```prisma
generator client {
  provider = "prisma-client-js"
  previewFeatures = ["fullTextSearch", "postgresqlExtensions"]
}

datasource db {
  provider = "postgresql"
  url = env("DATABASE_URL")
  shadowDatabaseUrl = env("SHADOW_DATABASE_URL")
  extensions = [uuidOssp(map: "uuid-ossp"), pg_trgm, timescaledb]
}
```

### PostgreSQL Configuration (docker-compose.yml)

```yaml
postgres:
  image: timescale/timescaledb:latest-pg16
  environment:
    POSTGRES_USER: postgres
    POSTGRES_PASSWORD: ${DB_PASSWORD:-postgres}
    POSTGRES_DB: biotrakr_dev
  command:
    - "postgres"
    - "-c"
    - "shared_buffers=2GB"
    - "-c"
    - "effective_cache_size=6GB"
    - "-c"
    - "maintenance_work_mem=512MB"
    - "-c"
    - "max_connections=200"
```

### Connection Pooling

For production, use Prisma's connection pooling or PgBouncer:

```typescript
// apps/api/src/database/prisma.service.ts
import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      log: ['query', 'error', 'warn'],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async enableShutdownHooks(app: INestApplication) {
    this.$on('beforeExit', async () => {
      await app.close();
    });
  }
}
```

---

## 📦 DATA MIGRATION STRATEGY

### Phase 1: Reference Data (Master Tables)

**Priority Order:**
1. Organizations → Facilities → Buildings → Floors → Rooms
2. Vendors
3. Departments
4. Users

**Example Migration Script:**

```typescript
// prisma/migrations/seed-reference-data.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedReferenceData() {
  // 1. Create Organizations
  const org = await prisma.organization.create({
    data: {
      name: 'General Hospital Network',
      type: 'health_system',
    },
  });

  // 2. Create Facilities
  const facility = await prisma.facility.create({
    data: {
      organizationId: org.id,
      name: 'General Hospital Main Campus',
      address: {
        street: '123 Medical Center Drive',
        city: 'New York',
        state: 'NY',
        zip: '10001',
        country: 'USA',
      },
      timezone: 'America/New_York',
    },
  });

  // 3. Create Buildings
  const building = await prisma.building.create({
    data: {
      facilityId: facility.id,
      buildingCode: 'MAIN',
      buildingName: 'Main Hospital Building',
      floorCount: 10,
    },
  });

  // 4. Create Floors
  for (let i = 1; i <= 10; i++) {
    await prisma.floor.create({
      data: {
        buildingId: building.id,
        floorNumber: i,
        floorName: `Floor ${i}`,
      },
    });
  }

  // 5. Create Vendors
  await prisma.vendor.createMany({
    data: [
      {
        vendorCode: 'GE001',
        vendorName: 'GE Healthcare',
        vendorType: 'MANUFACTURER',
        contactEmail: 'support@gehealthcare.com',
      },
      {
        vendorCode: 'SIE001',
        vendorName: 'Siemens Healthineers',
        vendorType: 'MANUFACTURER',
        contactEmail: 'service@siemens-healthineers.com',
      },
    ],
  });

  console.log('Reference data seeded successfully');
}

seedReferenceData()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

### Phase 2: Asset Data Migration

```typescript
// Example: Migrate from legacy system
async function migrateAssets() {
  const legacyAssets = await fetchFromLegacySystem();

  for (const legacy of legacyAssets) {
    await prisma.asset.create({
      data: {
        organizationId: legacy.orgId,
        facilityId: legacy.siteId,
        departmentId: legacy.deptId,
        assetTagNumber: legacy.tag,
        equipmentName: legacy.name,
        manufacturer: legacy.manufacturer,
        modelNumber: legacy.model,
        serialNumber: legacy.serial,
        deviceCategory: legacy.category,
        assetStatus: 'ACTIVE',
        criticalityLevel: legacy.criticality || 'MEDIUM',
        purchaseDate: new Date(legacy.purchaseDate),
        purchaseCost: legacy.cost,
        // ... map all fields
        createdById: adminUserId,
        updatedById: adminUserId,
      },
    });
  }
}
```

### Phase 3: Historical Data

For time-series data (location history, sensor readings), use batch inserts:

```typescript
async function migrateLocationHistory() {
  const batchSize = 1000;
  const legacyData = await fetchLegacyLocationData();

  for (let i = 0; i < legacyData.length; i += batchSize) {
    const batch = legacyData.slice(i, i + batchSize);
    
    await prisma.locationHistory.createMany({
      data: batch.map(record => ({
        assetId: record.assetId,
        timestamp: new Date(record.timestamp),
        facilityId: record.facilityId,
        roomId: record.roomId,
        coordinatesX: record.x,
        coordinatesY: record.y,
        trackingMethod: 'MIGRATED',
      })),
      skipDuplicates: true,
    });

    console.log(`Migrated ${Math.min(i + batchSize, legacyData.length)} / ${legacyData.length} records`);
  }
}
```

---

## ⚡ PERFORMANCE TUNING

### Prisma Query Optimization

```typescript
// Bad: N+1 query problem
const assets = await prisma.asset.findMany();
for (const asset of assets) {
  const facility = await prisma.facility.findUnique({
    where: { id: asset.facilityId }
  });
}

// Good: Use include/select
const assets = await prisma.asset.findMany({
  include: {
    facility: true,
    currentRoom: true,
    custodian: true,
  },
});

// Better: Select only needed fields
const assets = await prisma.asset.findMany({
  select: {
    id: true,
    assetTagNumber: true,
    equipmentName: true,
    facility: {
      select: {
        name: true,
      },
    },
  },
});
```

### Database Indexes

Prisma automatically creates indexes for:
- `@id` fields
- `@unique` fields
- Fields in `@@unique` constraints
- Foreign key relations

Add custom indexes for frequent queries:

```prisma
model Asset {
  // ...fields...

  @@index([assetStatus, criticalityLevel])
  @@index([nextPmDueDate])
  @@index([currentFacilityId, assetStatus])
  @@index([lastSeenTimestamp])
}
```

### TimescaleDB Optimization

```sql
-- Adjust chunk interval based on data volume
SELECT set_chunk_time_interval('location_history', INTERVAL '1 day');

-- Enable compression for old data
SELECT add_compression_policy('location_history', INTERVAL '30 days');

-- Create continuous aggregates for common queries
CREATE MATERIALIZED VIEW location_history_hourly
WITH (timescaledb.continuous) AS
SELECT 
    asset_id,
    time_bucket('1 hour', timestamp) AS hour,
    COUNT(*) AS location_updates,
    AVG(accuracy_meters) AS avg_accuracy
FROM location_history
GROUP BY asset_id, hour;
```

### Query Performance Monitoring

```typescript
// Enable Prisma query logging
const prisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'error', emit: 'stdout' },
    { level: 'warn', emit: 'stdout' },
  ],
});

prisma.$on('query', (e) => {
  if (e.duration > 1000) {
    console.warn(`Slow query detected (${e.duration}ms):`, e.query);
  }
});
```

---

## 💾 BACKUP & RECOVERY

### Automated Backup Script

```bash
#!/bin/bash
# scripts/backup-database.sh

BACKUP_DIR="/var/backups/biotrakr"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_NAME="biotrakr_dev"
DB_HOST="localhost"
DB_PORT="5433"
DB_USER="postgres"

# Create backup directory
mkdir -p $BACKUP_DIR

# Full database backup
docker exec biotrakr-postgres pg_dump -U $DB_USER -Fc $DB_NAME > \
  "$BACKUP_DIR/biotrakr_full_$TIMESTAMP.dump"

# Compress
gzip "$BACKUP_DIR/biotrakr_full_$TIMESTAMP.dump"

# Delete backups older than 30 days
find $BACKUP_DIR -name "biotrakr_full_*.dump.gz" -mtime +30 -delete

echo "Backup completed: biotrakr_full_$TIMESTAMP.dump.gz"
```

### Restore from Backup

```bash
# Extract backup
gunzip biotrakr_full_20251108_120000.dump.gz

# Restore to database
docker exec -i biotrakr-postgres pg_restore -U postgres -d biotrakr_dev -c \
  < biotrakr_full_20251108_120000.dump

# Verify
docker exec biotrakr-postgres psql -U postgres -d biotrakr_dev -c "SELECT COUNT(*) FROM assets;"
```

### Prisma Backup Workflow

```typescript
// scripts/backup-to-json.ts
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function backupToJSON() {
  const data = {
    organizations: await prisma.organization.findMany(),
    facilities: await prisma.facility.findMany(),
    assets: await prisma.asset.findMany(),
    // ... other tables
  };

  fs.writeFileSync(
    `backup_${Date.now()}.json`,
    JSON.stringify(data, null, 2)
  );
}

backupToJSON().finally(() => prisma.$disconnect());
```

---

## 🔒 SECURITY HARDENING

### Row-Level Security with Prisma

```typescript
// middleware/tenant-isolation.middleware.ts
prisma.$use(async (params, next) => {
  // Only for models with organizationId
  if (params.model && ['Asset', 'Facility', 'User'].includes(params.model)) {
    if (params.action === 'findMany' || params.action === 'findFirst') {
      params.args.where = {
        ...params.args.where,
        organizationId: currentUser.organizationId,
      };
    }
  }
  
  return next(params);
});
```

### Environment Variable Security

```bash
# .env (DO NOT COMMIT)
DATABASE_URL="postgresql://user:password@host:port/dbname"
JWT_SECRET="your-super-secret-jwt-key"
ENCRYPTION_KEY="your-encryption-key"

# Use environment-specific configs
NODE_ENV=production
```

### Audit Logging

```typescript
// middleware/audit-log.middleware.ts
prisma.$use(async (params, next) => {
  const before = Date.now();
  const result = await next(params);
  const after = Date.now();

  if (['create', 'update', 'delete'].includes(params.action)) {
    await prisma.auditLog.create({
      data: {
        userId: currentUser.id,
        action: params.action,
        model: params.model,
        recordId: result?.id,
        timestamp: new Date(),
        duration: after - before,
      },
    });
  }

  return result;
});
```

---

## 📊 MONITORING & MAINTENANCE

### Health Check Endpoint

```typescript
// apps/api/src/health/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get('db')
  async checkDatabase() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      
      const assetCount = await this.prisma.asset.count();
      const lastAsset = await this.prisma.asset.findFirst({
        orderBy: { updatedAt: 'desc' },
      });

      return {
        status: 'healthy',
        database: 'connected',
        assetCount,
        lastUpdate: lastAsset?.updatedAt,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        database: 'disconnected',
        error: error.message,
      };
    }
  }
}
```

### Maintenance Tasks

**Daily:**
```bash
# Run database vacuum (via cron)
0 2 * * * docker exec biotrakr-postgres vacuumdb -U postgres -d biotrakr_dev -z
```

**Weekly:**
```bash
# Reindex tables
0 3 * * 0 docker exec biotrakr-postgres reindexdb -U postgres -d biotrakr_dev
```

**Monthly:**
```bash
# Full vacuum and analyze
0 4 1 * * docker exec biotrakr-postgres vacuumdb -U postgres -d biotrakr_dev -f -z
```

---

## 🛠️ COMMON OPERATIONS

### Adding a New Organization/Facility

```typescript
async function setupNewFacility(data: NewFacilityInput) {
  return await prisma.$transaction(async (tx) => {
    // 1. Create or get organization
    const org = await tx.organization.upsert({
      where: { id: data.organizationId },
      create: { name: data.orgName, type: 'hospital' },
      update: {},
    });

    // 2. Create facility
    const facility = await tx.facility.create({
      data: {
        organizationId: org.id,
        name: data.facilityName,
        address: data.address,
        timezone: data.timezone,
      },
    });

    // 3. Create default departments
    await tx.department.createMany({
      data: [
        { facilityId: facility.id, name: 'Biomedical Engineering', code: 'BME' },
        { facilityId: facility.id, name: 'Radiology', code: 'RAD' },
        { facilityId: facility.id, name: 'Operating Rooms', code: 'OR' },
      ],
    });

    return facility;
  });
}
```

### Bulk Asset Import

```typescript
async function bulkImportAssets(csvFile: string) {
  const assets = parseCsv(csvFile);
  const batchSize = 100;

  for (let i = 0; i < assets.length; i += batchSize) {
    const batch = assets.slice(i, i + batchSize);
    
    await prisma.asset.createMany({
      data: batch.map(a => ({
        ...a,
        createdById: currentUser.id,
        updatedById: currentUser.id,
      })),
      skipDuplicates: true,
    });

    console.log(`Imported ${Math.min(i + batchSize, assets.length)} / ${assets.length} assets`);
  }
}
```

---

## 🐛 TROUBLESHOOTING

### Issue: Prisma Migration Fails

**Symptoms:**
```
Error: P3009: migrate found failed migrations in the target database
```

**Solution:**
```bash
# Mark migration as rolled back
pnpm prisma migrate resolve --rolled-back 20241108000000_migration_name

# Or reset database (DANGER: deletes all data)
pnpm prisma migrate reset
```

### Issue: Connection Pool Exhausted

**Symptoms:**
```
Error: Can't reach database server
```

**Solution:**
```typescript
// Increase connection pool size in DATABASE_URL
DATABASE_URL="postgresql://user:pass@host:5432/db?connection_limit=20"

// Or configure in PrismaClient
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  // Add connection pool configuration
});
```

### Issue: Slow Queries

**Diagnosis:**
```typescript
// Enable query logging
const prisma = new PrismaClient({ log: ['query'] });
```

**Solution:**
- Add missing indexes
- Use `select` instead of fetching all fields
- Implement pagination
- Use database views for complex queries

---

## 📚 ADDITIONAL RESOURCES

- [Prisma Documentation](https://www.prisma.io/docs)
- [TimescaleDB Documentation](https://docs.timescale.com/)
- [PostgreSQL Performance](https://www.postgresql.org/docs/current/performance-tips.html)
- [BioTrakr API Documentation](../API.md)

---

## ✅ PRE-DEPLOYMENT CHECKLIST

- [ ] PostgreSQL 15+ running with TimescaleDB
- [ ] Environment variables configured
- [ ] Prisma migrations applied successfully
- [ ] TimescaleDB hypertables created
- [ ] Sample data seeded for testing
- [ ] All indexes created
- [ ] Connection pooling configured
- [ ] Backup strategy implemented
- [ ] Monitoring endpoints configured
- [ ] Security middleware enabled
- [ ] Performance benchmarks completed
- [ ] Documentation reviewed by team

---

**Document Version:** 2.0  
**Last Updated:** November 8, 2025  
**Next Review:** After production deployment

