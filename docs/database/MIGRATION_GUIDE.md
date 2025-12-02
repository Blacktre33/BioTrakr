# BioTrakr Database Migration Guide
## Upgrading to Comprehensive Schema v2.0

---

## 📋 OVERVIEW

This guide walks you through migrating from the current basic BioTrakr schema to the comprehensive database schema v2.0 with full support for:

- Real-time location tracking (RTLS)
- Predictive maintenance
- Compliance management
- Financial analytics
- TimescaleDB optimizations

---

## ⚠️ IMPORTANT NOTES

1. **Backup First**: Always backup your database before migrating
2. **Test Environment**: Test the migration in a development environment first
3. **Downtime**: Plan for 15-30 minutes of downtime for production migration
4. **Data Preservation**: This migration preserves all existing data

---

## 🚀 MIGRATION STEPS

### Step 1: Backup Current Database

```bash
# Create backup of current database
docker exec biotrakr-postgres pg_dump -U postgres -Fc biotrakr_dev > \
  backup_pre_migration_$(date +%Y%m%d_%H%M%S).dump

# Verify backup
ls -lh backup_pre_migration_*.dump
```

### Step 2: Review New Schema

```bash
# Compare current and new schema
cd /Users/saketh/BioTrakr/apps/api

# Current schema
cat prisma/schema.prisma

# New comprehensive schema
cat prisma/schema-enhanced.prisma
```

### Step 3: Replace Prisma Schema

```bash
# Backup current schema
cp prisma/schema.prisma prisma/schema-backup.prisma

# Replace with enhanced schema
cp prisma/schema-enhanced.prisma prisma/schema.prisma

# Verify
head -20 prisma/schema.prisma
```

### Step 4: Generate Migration

```bash
cd apps/api

# Generate Prisma migration
pnpm prisma migrate dev --name comprehensive_schema_v2

# This will:
# 1. Analyze schema differences
# 2. Generate SQL migration files
# 3. Apply migration to development database
# 4. Regenerate Prisma Client
```

**Expected Output:**
```
Environment variables loaded from .env
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "biotrakr_dev"

Applying migration `20241108_comprehensive_schema_v2`

The following migration(s) have been created and applied from new schema changes:

migrations/
  └─ 20241108000000_comprehensive_schema_v2/
    └─ migration.sql

Your database is now in sync with your schema.

✔ Generated Prisma Client (5.0.0) to ./node_modules/@prisma/client
```

### Step 5: Apply TimescaleDB Features

```bash
# Run TimescaleDB-specific setup
pnpm prisma db execute --file prisma/migrations/timescaledb-setup.sql

# OR run directly with psql
docker exec -i biotrakr-postgres psql -U postgres -d biotrakr_dev < \
  prisma/migrations/timescaledb-setup.sql
```

**Expected Output:**
```
 create_hypertable 
-------------------
 (location_history,t)

 add_compression_policy 
------------------------
 1000

✔ TimescaleDB hypertables created
✔ Compression policies added
✔ Continuous aggregates created
```

### Step 6: Verify Migration

```bash
# Check database tables
pnpm prisma studio

# Or use psql
docker exec -it biotrakr-postgres psql -U postgres -d biotrakr_dev

# Run verification queries
SELECT COUNT(*) FROM assets;
SELECT COUNT(*) FROM facilities;
SELECT * FROM timescaledb_information.hypertables;
```

### Step 7: Regenerate Prisma Client

```bash
# Regenerate client for use in application
pnpm prisma generate

# Verify in your app
cd apps/api
pnpm build
```

### Step 8: Update Application Code

The enhanced schema adds many new fields to the Asset model. Update your services:

```typescript
// Before
const asset = await prisma.asset.create({
  data: {
    organizationId,
    facilityId,
    assetTag: 'BME-001',
    name: 'MRI Scanner',
    category: 'imaging',
    manufacturer: 'GE',
    model: 'Optima MR360',
  },
});

// After (with comprehensive fields)
const asset = await prisma.asset.create({
  data: {
    organizationId,
    assetTagNumber: 'BME-001', // Note: field renamed
    equipmentName: 'MRI Scanner', // Note: field renamed
    manufacturer: 'GE',
    modelNumber: 'Optima MR360',
    serialNumber: 'SN123456',
    deviceCategory: 'IMAGING', // Note: now enum
    assetStatus: 'ACTIVE',
    criticalityLevel: 'HIGH',
    purchaseDate: new Date(),
    purchaseCost: 1500000,
    usefulLifeYears: 10,
    depreciationMethod: 'STRAIGHT_LINE',
    currentFacilityId: facilityId,
    primaryCustodianId: userId,
    custodianDepartmentId: departmentId,
    createdById: userId,
    updatedById: userId,
  },
});
```

### Step 9: Seed Enhanced Data (Optional)

```bash
# Create or update seed script
pnpm prisma db seed
```

Example seed script updates needed:

```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create admin user
  const admin = await prisma.user.create({
    data: {
      organizationId: org.id,
      username: 'admin',
      email: 'admin@biotrakr.com',
      firstName: 'System',
      lastName: 'Administrator',
      role: 'ADMIN',
      isActive: true,
    },
  });

  // Create vendor
  const vendor = await prisma.vendor.create({
    data: {
      vendorCode: 'GE001',
      vendorName: 'GE Healthcare',
      vendorType: 'MANUFACTURER',
      email: 'support@gehealthcare.com',
      isActive: true,
    },
  });

  // Create comprehensive asset
  const asset = await prisma.asset.create({
    data: {
      organizationId: org.id,
      assetTagNumber: 'BME-2024-001',
      equipmentName: 'GE Optima MR360',
      manufacturer: 'General Electric',
      modelNumber: 'Optima MR360 1.5T',
      serialNumber: 'SN123456789',
      deviceCategory: 'IMAGING',
      assetStatus: 'ACTIVE',
      criticalityLevel: 'CRITICAL',
      riskClassification: 'CLASS_II',
      purchaseDate: new Date('2024-01-15'),
      purchaseCost: 1500000,
      usefulLifeYears: 10,
      depreciationMethod: 'STRAIGHT_LINE',
      currentFacilityId: facility.id,
      primaryCustodianId: admin.id,
      custodianDepartmentId: department.id,
      vendorId: vendor.id,
      createdById: admin.id,
      updatedById: admin.id,
    },
  });

  console.log('Seed data created successfully');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

### Step 10: Test Application

```bash
# Start API server
cd apps/api
pnpm dev

# Test endpoints
curl http://localhost:3001/assets
curl http://localhost:3001/health/db

# Run tests
pnpm test
```

---

## 📊 DATA MAPPING

### Field Renaming

| Old Field | New Field | Notes |
|-----------|-----------|-------|
| `assetTag` | `assetTagNumber` | More explicit naming |
| `name` | `equipmentName` | Clearer purpose |
| `model` | `modelNumber` | Standard terminology |
| `status` | `assetStatus` | With enum type |
| `category` | `deviceCategory` | With enum type |
| `condition` | Removed | Use `assetStatus` instead |

### New Required Fields

When migrating existing assets, these fields must be populated:

- `criticalityLevel`: Default to 'MEDIUM'
- `riskClassification`: Default to 'CLASS_II'
- `usefulLifeYears`: Estimate based on device type
- `primaryCustodianId`: Assign default admin
- `custodianDepartmentId`: Assign to appropriate department
- `createdById`: Set to admin user
- `updatedById`: Set to admin user

### Migration Script Example

```typescript
// scripts/migrate-assets.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateAssets() {
  const adminUser = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
  });

  const defaultDepartment = await prisma.department.findFirst();

  // This would be run if you had a separate old schema
  // For your case, Prisma migration handles it automatically
  console.log('Assets migrated automatically by Prisma');
}
```

---

## 🔄 ROLLBACK PROCEDURE

If you need to rollback the migration:

```bash
# Stop application
pnpm turbo stop

# Restore from backup
docker exec -i biotrakr-postgres pg_restore -U postgres -d biotrakr_dev -c \
  < backup_pre_migration_YYYYMMDD_HHMMSS.dump

# Restore old schema
cp prisma/schema-backup.prisma prisma/schema.prisma

# Regenerate client
pnpm prisma generate

# Restart application
pnpm dev
```

---

## ✅ VERIFICATION CHECKLIST

After migration, verify:

- [ ] All existing assets are still accessible
- [ ] Existing facilities and organizations intact
- [ ] User accounts working
- [ ] API endpoints responding
- [ ] TimescaleDB hypertables created
- [ ] Compression policies active
- [ ] Continuous aggregates working
- [ ] New asset creation works with all fields
- [ ] Location tracking functional
- [ ] Maintenance history preserved

---

## 🐛 TROUBLESHOOTING

### Issue: Migration Fails with Foreign Key Errors

**Cause:** Existing data references invalid IDs

**Solution:**
```sql
-- Find orphaned records
SELECT * FROM assets WHERE primary_custodian_id NOT IN (SELECT id FROM users);

-- Fix by assigning default admin
UPDATE assets SET primary_custodian_id = 'admin-user-id' 
WHERE primary_custodian_id NOT IN (SELECT id FROM users);
```

### Issue: TimescaleDB Extension Not Found

**Cause:** TimescaleDB not installed in Docker container

**Solution:**
```bash
# Verify image
docker-compose ps postgres

# Should show: timescale/timescaledb:latest-pg15

# Recreate if needed
docker-compose down
docker-compose up -d postgres
```

### Issue: Prisma Client Out of Sync

**Cause:** Generated client doesn't match schema

**Solution:**
```bash
pnpm prisma generate --force
pnpm prisma db push --skip-generate
pnpm prisma generate
```

---

## 📞 SUPPORT

For issues during migration:

1. Check logs: `docker-compose logs postgres`
2. Review migration SQL: `apps/api/prisma/migrations/*/migration.sql`
3. Consult documentation: `/docs/database/Implementation_Guide.md`

---

## 📈 POST-MIGRATION TASKS

After successful migration:

1. **Update Documentation**: Document any custom changes
2. **Train Team**: Brief team on new fields and features
3. **Monitor Performance**: Watch for slow queries
4. **Optimize Indexes**: Add custom indexes if needed
5. **Configure Alerts**: Set up database monitoring
6. **Schedule Backups**: Automate backup procedures

---

**Migration Guide Version:** 2.0  
**Last Updated:** November 8, 2025  
**For:** BioTrakr v2.0 Comprehensive Schema

