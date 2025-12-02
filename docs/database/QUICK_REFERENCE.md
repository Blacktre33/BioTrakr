# BioTrakr Database - Quick Reference Card

---

## 🚀 QUICK START COMMANDS

```bash
# Navigate to API directory
cd /Users/saketh/BioTrakr/apps/api

# Apply the comprehensive schema
cp prisma/schema-enhanced.prisma prisma/schema.prisma
pnpm prisma migrate dev --name comprehensive_schema_v2
pnpm prisma db execute --file prisma/migrations/timescaledb-setup.sql

# Open Prisma Studio
pnpm prisma studio

# Test the API
pnpm dev
```

---

## 📁 FILE LOCATIONS

```
/Users/saketh/BioTrakr/
├── docs/database/                  ← Documentation
│   ├── README.md                   ← Start here
│   ├── IMPLEMENTATION_SUMMARY.md   ← Overview
│   ├── MIGRATION_GUIDE.md          ← How to migrate
│   ├── Database_Requirements.md    ← What we track
│   ├── Implementation_Guide.md     ← Operations manual
│   ├── Query_Examples.md           ← Query patterns
│   └── QUICK_REFERENCE.md          ← This file
│
└── apps/api/prisma/
    ├── schema-enhanced.prisma      ← New comprehensive schema
    ├── schema.prisma               ← Current schema (replace with enhanced)
    └── migrations/
        └── timescaledb-setup.sql   ← Run after Prisma migration
```

---

## 🎯 COMMON TASKS

### View Database
```bash
pnpm prisma studio
```

### Create Migration
```bash
pnpm prisma migrate dev --name description_here
```

### Reset Database (⚠️ DESTROYS DATA)
```bash
pnpm prisma migrate reset
```

### Seed Database
```bash
pnpm prisma db seed
```

### Generate Prisma Client
```bash
pnpm prisma generate
```

### Check Migration Status
```bash
pnpm prisma migrate status
```

---

## 📊 KEY MODELS

### Core Models
- **Organization** - Top-level tenant
- **Facility** - Hospital/clinic location
- **Building** → **Floor** → **Room** - Location hierarchy
- **Department** - Organizational units
- **User** - Staff members
- **Vendor** - Suppliers and service providers

### Asset Management
- **Asset** - Main equipment table (100+ fields)
- **LocationHistory** - Real-time location tracking (TimescaleDB)
- **UsageLog** - Asset usage sessions (TimescaleDB)
- **MaintenanceHistory** - Service records and work orders

### Analytics & ML
- **IoTSensorReading** - Sensor data (TimescaleDB)
- **PredictiveScoreHistory** - ML predictions (TimescaleDB)
- **MLModel** - Model registry

### Compliance & Tracking
- **ComplianceEvent** - Inspections and certifications
- **AlertHistory** - Notifications and alerts
- **AssignmentHistory** - Custody chain
- **TransferHistory** - Inter-facility moves

---

## 🔍 USEFUL QUERIES

### Find Asset
```typescript
const asset = await prisma.asset.findUnique({
  where: { assetTagNumber: 'BME-2024-001' },
  include: {
    currentFacility: true,
    currentRoom: true,
    custodian: true,
  },
});
```

### List Assets in Facility
```typescript
const assets = await prisma.asset.findMany({
  where: {
    currentFacilityId: facilityId,
    deletedAt: null,
  },
  orderBy: { equipmentName: 'asc' },
});
```

### Overdue Maintenance
```typescript
const overdue = await prisma.asset.findMany({
  where: {
    nextPmDueDate: { lt: new Date() },
    assetStatus: { in: ['ACTIVE', 'IN_SERVICE'] },
  },
  include: { custodian: true },
});
```

### Location History
```typescript
const history = await prisma.locationHistory.findMany({
  where: { assetId },
  orderBy: { timestamp: 'desc' },
  take: 100,
});
```

---

## 🗂️ KEY ENUMS

```typescript
// Asset Status
ACTIVE, IN_SERVICE, IN_MAINTENANCE, QUARANTINED, RETIRED, DISPOSED

// Device Category
IMAGING, LABORATORY, SURGICAL, PATIENT_MONITORING, THERAPEUTIC, LIFE_SUPPORT

// Criticality Level
CRITICAL, HIGH, MEDIUM, LOW

// Work Order Type
PREVENTIVE_MAINTENANCE, CORRECTIVE_MAINTENANCE, CALIBRATION, INSPECTION

// Tracking Method
RFID, BLE, QR, GPS, MANUAL
```

---

## ⚠️ FIELD RENAMES

| Old | New | Type |
|-----|-----|------|
| `assetTag` | `assetTagNumber` | String |
| `name` | `equipmentName` | String |
| `model` | `modelNumber` | String |
| `category` | `deviceCategory` | Enum |
| `status` | `assetStatus` | Enum |

---

## 🛠️ TROUBLESHOOTING

### Prisma Client Out of Sync
```bash
pnpm prisma generate --force
```

### Migration Failed
```bash
pnpm prisma migrate resolve --rolled-back migration_name
```

### Check TimescaleDB
```sql
SELECT * FROM timescaledb_information.hypertables;
```

### View Database Size
```sql
SELECT pg_size_pretty(pg_database_size('biotrakr_dev'));
```

---

## 📞 NEED HELP?

1. **Read**: `/docs/database/IMPLEMENTATION_SUMMARY.md`
2. **Migrate**: `/docs/database/MIGRATION_GUIDE.md`
3. **Query**: `/docs/database/Query_Examples.md`
4. **Deploy**: `/docs/database/Implementation_Guide.md`

---

## ✅ QUICK CHECKLIST

Before deploying:
- [ ] Backup current database
- [ ] Test migration in dev environment
- [ ] Update application code for field renames
- [ ] Run TimescaleDB setup script
- [ ] Verify all tests pass
- [ ] Check Prisma Studio for data integrity

---

**Quick Reference Version:** 2.0  
**Last Updated:** November 8, 2025

