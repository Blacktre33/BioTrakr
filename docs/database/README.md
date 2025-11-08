# BioTrakr Database Schema Package
## Complete Database Design & Implementation Guide

---

## 📦 PACKAGE CONTENTS

This package contains comprehensive database design documentation for BioTrakr's asset management system:

### 1. **Database_Requirements.md**
**What it is:** Complete specification of all database fields and requirements  
**Use it for:** Understanding what data needs to be tracked and why  
**Key sections:**
- 15 detailed data domains with field specifications
- Master data tables structure
- Success criteria and design decisions
- Schema design patterns

### 2. **Prisma Schema** (apps/api/prisma/schema.prisma)
**What it is:** Production-ready database schema using Prisma ORM  
**Use it for:** Creating and managing the actual database  
**Key features:**
- 30+ models with complete relationships
- TimescaleDB support for time-series data
- Comprehensive indexes for performance
- Type safety with Prisma Client
- Migration management

### 3. **Implementation_Guide.md**
**What it is:** Step-by-step deployment and operations manual  
**Use it for:** Installing, configuring, and maintaining the database  
**Key sections:**
- Installation procedures
- Configuration tuning
- Data migration strategy
- Backup & recovery
- Security hardening
- Performance optimization
- Troubleshooting

### 4. **Query_Examples.md**
**What it is:** 100+ ready-to-use queries for common operations  
**Use it for:** Daily database operations and reporting  
**Categories:**
- Asset searches and filters
- Location tracking queries
- Maintenance management
- Predictive analytics
- Compliance reporting
- Utilization analysis
- Financial reporting
- Alert generation

---

## 🚀 QUICK START

### For Developers

```bash
# 1. Ensure PostgreSQL with TimescaleDB is running
docker-compose up -d postgres

# 2. Run Prisma migrations
cd apps/api
pnpm prisma migrate dev

# 3. Apply TimescaleDB-specific features
pnpm prisma db execute --file prisma/migrations/timescaledb-setup.sql

# 4. Seed the database (optional)
pnpm prisma db seed

# 5. Verify
pnpm prisma studio
```

### For Product Managers
1. Read `Database_Requirements.md` to understand data model
2. Review the 15 data domains and ensure they meet business needs
3. Cross-reference with PRD functional requirements

### For DBAs
1. Review `Implementation_Guide.md` for deployment strategy
2. Plan hardware based on sizing recommendations
3. Configure backup strategy
4. Set up monitoring

---

## 📊 DATABASE OVERVIEW

### Core Statistics
- **30+ Models:** Normalized relational structure
- **100+ Fields in Main Assets Table:** Comprehensive tracking
- **4 TimescaleDB Hypertables:** Time-series optimization
- **50+ Indexes:** Query performance
- **15+ Enums:** Data integrity
- **10+ Views:** Common query patterns

### Key Design Principles
1. **RTLS-First:** Real-time location tracking is core, not add-on
2. **ML-Ready:** Time-series data optimized for predictive models
3. **Compliance-Native:** Regulatory requirements baked into schema
4. **Multi-Tenancy:** 50+ facilities support from day one
5. **Audit Everything:** Complete traceability for healthcare

---

## 🎯 ADDRESSES CRITICAL GAPS

Based on your BioTrakr requirements, this schema directly addresses:

### ✅ **Functional Requirements Coverage**

| PRD Section | Schema Coverage |
|-------------|-----------------|
| **Asset Registry** | ✅ **COMPLETE** - Full asset model with 100+ fields |
| **Real-Time Tracking** | ✅ **COMPLETE** - RFID/BLE/GPS fields + location_history hypertable |
| **Predictive Maintenance** | ✅ **COMPLETE** - ML prediction fields + IoT sensor tables |
| **Compliance** | ✅ **COMPLETE** - UDI, FDA, certifications, inspections |
| **Analytics** | ✅ **COMPLETE** - Utilization, TCO, usage patterns |

### 🔧 **Technical Architecture Alignment**

| Layer | Schema Support |
|-------|----------------|
| **PostgreSQL Primary DB** | ✅ Optimized for PostgreSQL 15+ |
| **TimescaleDB Time-Series** | ✅ Hypertables for location/IoT/usage data |
| **Multi-Facility** | ✅ Facilities → Buildings → Floors → Rooms hierarchy |
| **EHR/CMMS Integration** | ✅ External system ID fields |
| **HIPAA Compliance** | ✅ Audit trails, encryption-ready |

---

## 💡 KEY FEATURES

### 1. Real-Time Location Tracking
- **Sub-room accuracy:** X/Y/Z coordinates
- **Multiple tracking methods:** RFID, BLE, QR, GPS, Manual
- **Historical tracking:** TimescaleDB hypertable with 7-day chunks
- **Geofencing:** Restricted area alerts

### 2. Predictive Maintenance
- **ML model integration:** Failure probability scoring
- **IoT sensor support:** Temperature, vibration, power monitoring
- **MTBF/MTTR tracking:** Reliability metrics
- **Automated work orders:** Triggers for overdue PM

### 3. Compliance & Regulatory
- **UDI tracking:** FDA requirement
- **Certification management:** Expiry alerts
- **Inspection history:** Complete audit trail
- **Recall management:** Class I/II/III tracking

### 4. Financial Analytics
- **Total Cost of Ownership:** Purchase + maintenance + downtime
- **Depreciation:** Multiple methods supported
- **Budget forecasting:** End-of-life replacement planning
- **ROI calculations:** Asset value tracking

### 5. Multi-Facility Support
- **Hierarchical locations:** Facility → Building → Floor → Room
- **Transfer tracking:** Inter-facility asset moves
- **Department assignments:** Organizational structure
- **User access control:** Facility-level isolation

---

## 🔒 SECURITY FEATURES

- **Row-Level Security (RLS):** Organization-based isolation
- **Audit logging:** Who/what/when for all changes
- **Soft deletes:** Recovery without data loss
- **Optimistic locking:** Prevent concurrent update conflicts
- **Encryption-ready:** Fields prepared for encryption
- **HIPAA-compliant:** Audit trails and access controls

---

## ⚡ PERFORMANCE OPTIMIZATIONS

- **50+ Indexes:** Strategic placement on foreign keys and query patterns
- **TimescaleDB compression:** Automatic for data >30 days old
- **Connection pooling:** Via Prisma
- **Full-text search:** Equipment name/model fuzzy matching
- **JSON indexes:** Fast queries on flexible attributes

---

## 📚 USAGE EXAMPLES

### Find an Asset
```typescript
const asset = await prisma.asset.findUnique({
  where: { assetTagNumber: 'BME-2024-001234' },
  include: {
    currentRoom: true,
    currentFacility: true,
    custodian: true
  }
});
```

### Track Asset Movement
```typescript
const history = await prisma.locationHistory.findMany({
  where: { assetId },
  orderBy: { timestamp: 'desc' },
  take: 100
});
```

### Generate Overdue PM Report
```typescript
const overdueAssets = await prisma.asset.findMany({
  where: {
    nextPmDueDate: { lt: new Date() },
    assetStatus: { in: ['ACTIVE', 'IN_SERVICE'] },
    deletedAt: null
  },
  include: { custodian: true, department: true }
});
```

**See Query_Examples.md for 100+ more queries**

---

## 🎯 NEXT STEPS

### Immediate
1. ✅ Review documentation
2. Run Prisma migrations
3. Configure TimescaleDB features
4. Seed test data

### Short-term
5. Build REST API endpoints
6. Implement authentication/authorization
7. Start location tracking ingestion
8. Create analytics dashboard

### Medium-term
9. RFID/BLE hardware integration
10. Train initial ML models
11. Build compliance reporting
12. Implement alert system

---

## 📈 EXPECTED OUTCOMES

With this schema implementation, BioTrakr will have:

✅ **Solid foundation** for all PRD features  
✅ **Scalable architecture** for 50+ facilities  
✅ **Real-time tracking** capability  
✅ **Predictive maintenance** infrastructure  
✅ **Compliance-ready** data model  
✅ **Analytics-enabled** reporting  
✅ **Production-grade** performance  

**Estimated implementation time:** 2-4 weeks for core deployment, 8-12 weeks for full feature integration

---

**Package Version:** 2.0  
**Created:** November 8, 2025  
**Database:** PostgreSQL 15+ with TimescaleDB  
**ORM:** Prisma 5+  
**Status:** Ready for Implementation ✅

