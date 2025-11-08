# BioTrakr Database Query Examples
## Common Use Cases with Prisma ORM

---

## 📋 TABLE OF CONTENTS

1. [Asset Queries](#asset-queries)
2. [Location Tracking](#location-tracking)
3. [Maintenance Management](#maintenance-management)
4. [Predictive Analytics](#predictive-analytics)
5. [Compliance Reporting](#compliance-reporting)
6. [Utilization Analytics](#utilization-analytics)
7. [Financial Reporting](#financial-reporting)
8. [Alert Generation](#alert-generation)
9. [Performance Optimization](#performance-optimization)

---

## 🔍 ASSET QUERIES

### Find Asset by Tag or Serial Number

```typescript
// Quick lookup by asset tag
const asset = await prisma.asset.findUnique({
  where: { assetTagNumber: 'BME-2024-001234' },
  include: {
    currentFacility: true,
    currentRoom: true,
    custodian: true,
    department: true,
  },
});

// Find by serial number
const assetBySerial = await prisma.asset.findFirst({
  where: { serialNumber: 'SN123456789' },
});

// Find with location details
const assetWithLocation = await prisma.asset.findUnique({
  where: { assetTagNumber: 'BME-2024-001234' },
  select: {
    id: true,
    assetTagNumber: true,
    equipmentName: true,
    modelNumber: true,
    lastSeenTimestamp: true,
    currentFacility: {
      select: { name: true },
    },
    currentRoom: {
      select: { roomName: true, roomCode: true },
    },
    currentFloor: {
      select: { floorName: true, floorNumber: true },
    },
  },
});
```

### Search Assets by Equipment Name

```typescript
// Simple text search
const assets = await prisma.asset.findMany({
  where: {
    OR: [
      { equipmentName: { contains: 'MRI', mode: 'insensitive' } },
      { modelNumber: { contains: 'MRI', mode: 'insensitive' } },
      { manufacturer: { contains: 'GE', mode: 'insensitive' } },
    ],
    deletedAt: null,
  },
  orderBy: { equipmentName: 'asc' },
});

// Full-text search (requires PostgreSQL extension)
const assetsFullText = await prisma.$queryRaw`
  SELECT * FROM assets
  WHERE to_tsvector('english', equipment_name || ' ' || model_number || ' ' || manufacturer)
    @@ to_tsquery('english', 'MRI | CT | Imaging')
    AND deleted_at IS NULL
  ORDER BY equipment_name;
`;
```

### List All Assets in a Facility

```typescript
const facilityAssets = await prisma.asset.findMany({
  where: {
    currentFacilityId: facilityId,
    deletedAt: null,
  },
  include: {
    department: {
      select: { name: true },
    },
    currentRoom: {
      select: { roomName: true },
    },
    custodian: {
      select: { firstName: true, lastName: true },
    },
  },
  orderBy: [
    { deviceCategory: 'asc' },
    { equipmentName: 'asc' },
  ],
});
```

### Assets by Department with Cost Summary

```typescript
const departmentSummary = await prisma.department.findMany({
  where: {
    facilityId,
  },
  select: {
    name: true,
    assets: {
      where: {
        deletedAt: null,
        assetStatus: { in: ['ACTIVE', 'IN_SERVICE'] },
      },
      select: {
        deviceCategory: true,
        purchaseCost: true,
        currentBookValue: true,
        totalMaintenanceCostLifetime: true,
        utilizationRatePercent: true,
      },
    },
  },
});

// Aggregate by department
const summary = departmentSummary.map(dept => ({
  department: dept.name,
  assetCount: dept.assets.length,
  totalPurchaseCost: dept.assets.reduce((sum, a) => sum + (a.purchaseCost?.toNumber() || 0), 0),
  totalCurrentValue: dept.assets.reduce((sum, a) => sum + (a.currentBookValue?.toNumber() || 0), 0),
  avgUtilization: dept.assets.reduce((sum, a) => sum + (a.utilizationRatePercent?.toNumber() || 0), 0) / dept.assets.length,
}));
```

### Find Missing/Lost Assets

```typescript
const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

const missingAssets = await prisma.asset.findMany({
  where: {
    deletedAt: null,
    assetStatus: { in: ['ACTIVE', 'IN_SERVICE'] },
    lastSeenTimestamp: {
      lt: twentyFourHoursAgo,
    },
  },
  include: {
    currentRoom: {
      select: { roomName: true },
    },
    custodian: {
      select: { firstName: true, lastName: true, phone: true, email: true },
    },
  },
  orderBy: [
    { criticalityLevel: 'asc' }, // CRITICAL first
    { lastSeenTimestamp: 'asc' },
  ],
});
```

---

## 📍 LOCATION TRACKING

### Current Location of All Assets

```typescript
const assetsWithLocation = await prisma.asset.findMany({
  where: {
    deletedAt: null,
  },
  select: {
    id: true,
    assetTagNumber: true,
    equipmentName: true,
    lastSeenTimestamp: true,
    isMoving: true,
    currentFacility: {
      select: { name: true },
    },
    currentBuilding: {
      select: { buildingName: true },
    },
    currentFloor: {
      select: { floorName: true, floorNumber: true },
    },
    currentRoom: {
      select: { roomName: true, roomCode: true },
    },
    currentZone: true,
  },
  orderBy: {
    lastSeenTimestamp: 'desc',
  },
});
```

### Track Asset Movement History

```typescript
// Get location history for specific asset
const locationHistory = await prisma.locationHistory.findMany({
  where: {
    assetId,
    timestamp: {
      gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
    },
  },
  include: {
    facility: {
      select: { name: true },
    },
    room: {
      select: { roomName: true, roomCode: true },
    },
    recordedByUser: {
      select: { firstName: true, lastName: true },
    },
  },
  orderBy: {
    timestamp: 'desc',
  },
  take: 100,
});

// Create breadcrumb trail for map visualization
const trail = locationHistory.map(h => ({
  timestamp: h.timestamp,
  x: h.coordinatesX?.toNumber(),
  y: h.coordinatesY?.toNumber(),
  room: h.room?.roomName,
  method: h.trackingMethod,
}));
```

### Assets in Restricted Areas (Geofence Violations)

```typescript
const restrictedAssets = await prisma.asset.findMany({
  where: {
    currentRoom: {
      isRestricted: true,
    },
    geofenceAlertEnabled: true,
    deletedAt: null,
  },
  include: {
    currentRoom: {
      select: { roomName: true, roomCode: true },
    },
    custodian: {
      select: { firstName: true, lastName: true, email: true },
    },
  },
  orderBy: [
    { geofenceViolations: 'desc' },
    { lastSeenTimestamp: 'desc' },
  ],
});
```

### Room Utilization Heat Map

```typescript
// Get room visit counts
const roomUtilization = await prisma.locationHistory.groupBy({
  by: ['roomId'],
  where: {
    timestamp: {
      gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
    },
  },
  _count: {
    _all: true,
  },
  _avg: {
    accuracyMeters: true,
  },
});

// Enrich with room details
const heatMapData = await Promise.all(
  roomUtilization.map(async (r) => {
    const room = await prisma.room.findUnique({
      where: { id: r.roomId! },
      select: { roomName: true, roomType: true, centerX: true, centerY: true },
    });
    return {
      ...room,
      visitCount: r._count._all,
      avgAccuracy: r._avg.accuracyMeters,
    };
  })
);
```

### Real-Time Asset Map (Current Positions)

```typescript
const assetPositions = await prisma.asset.findMany({
  where: {
    deletedAt: null,
    currentCoordinatesX: { not: null },
    currentCoordinatesY: { not: null },
    lastSeenTimestamp: {
      gte: new Date(Date.now() - 15 * 60 * 1000), // Last 15 minutes
    },
  },
  select: {
    id: true,
    assetTagNumber: true,
    equipmentName: true,
    deviceCategory: true,
    criticalityLevel: true,
    currentCoordinatesX: true,
    currentCoordinatesY: true,
    locationAccuracyMeters: true,
    lastSeenTimestamp: true,
    isMoving: true,
    currentFloor: {
      select: {
        id: true,
        floorPlanImageUrl: true,
        floorPlanScaleMetersPerPixel: true,
      },
    },
  },
  orderBy: {
    criticalityLevel: 'asc', // CRITICAL assets first
  },
});
```

---

## 🔧 MAINTENANCE MANAGEMENT

### Upcoming Preventive Maintenance Schedule

```typescript
const today = new Date();
const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

const upcomingPM = await prisma.asset.findMany({
  where: {
    deletedAt: null,
    assetStatus: { in: ['ACTIVE', 'IN_SERVICE'] },
    nextPmDueDate: {
      gte: today,
      lte: thirtyDaysFromNow,
    },
  },
  include: {
    custodian: {
      select: { firstName: true, lastName: true, email: true },
    },
    department: {
      select: { name: true },
    },
  },
  orderBy: [
    { nextPmDueDate: 'asc' },
    { criticalityLevel: 'asc' },
  ],
});

// Calculate days until due
const pmSchedule = upcomingPM.map(asset => ({
  ...asset,
  daysUntilDue: Math.floor(
    (asset.nextPmDueDate!.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  ),
}));
```

### Overdue Maintenance Report

```typescript
const overdueAssets = await prisma.asset.findMany({
  where: {
    deletedAt: null,
    assetStatus: { in: ['ACTIVE', 'IN_SERVICE'] },
    nextPmDueDate: {
      lt: new Date(),
    },
  },
  include: {
    custodian: {
      select: { firstName: true, lastName: true, email: true },
    },
    department: {
      select: { name: true },
    },
  },
  orderBy: {
    nextPmDueDate: 'asc',
  },
});

// Group by priority
const grouped = {
  critical: overdueAssets.filter(
    a => new Date().getTime() - a.nextPmDueDate!.getTime() > 30 * 24 * 60 * 60 * 1000
  ),
  high: overdueAssets.filter(
    a => {
      const daysOverdue = (new Date().getTime() - a.nextPmDueDate!.getTime()) / (1000 * 60 * 60 * 24);
      return daysOverdue > 14 && daysOverdue <= 30;
    }
  ),
  medium: overdueAssets.filter(
    a => {
      const daysOverdue = (new Date().getTime() - a.nextPmDueDate!.getTime()) / (1000 * 60 * 60 * 24);
      return daysOverdue <= 14;
    }
  ),
};
```

### Maintenance History with Costs

```typescript
const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

const maintenanceStats = await prisma.asset.findMany({
  where: {
    deletedAt: null,
    maintenanceHistory: {
      some: {
        completedAt: {
          gte: sixMonthsAgo,
        },
      },
    },
  },
  select: {
    assetTagNumber: true,
    equipmentName: true,
    maintenanceHistory: {
      where: {
        completedAt: {
          gte: sixMonthsAgo,
        },
      },
      select: {
        totalCost: true,
        downtimeHours: true,
        actualDurationHours: true,
        failureCategory: true,
      },
    },
  },
});

// Aggregate maintenance costs
const aggregated = maintenanceStats.map(asset => ({
  assetTag: asset.assetTagNumber,
  equipmentName: asset.equipmentName,
  maintenanceCount: asset.maintenanceHistory.length,
  totalCost: asset.maintenanceHistory.reduce(
    (sum, m) => sum + (m.totalCost?.toNumber() || 0),
    0
  ),
  totalDowntime: asset.maintenanceHistory.reduce(
    (sum, m) => sum + (m.downtimeHours?.toNumber() || 0),
    0
  ),
  avgRepairTime: asset.maintenanceHistory.reduce(
    (sum, m) => sum + (m.actualDurationHours?.toNumber() || 0),
    0
  ) / asset.maintenanceHistory.length,
}));
```

### Auto-Generate Work Orders for Overdue PM

```typescript
async function generateOverduePMWorkOrders(adminUserId: string) {
  const overdueAssets = await prisma.asset.findMany({
    where: {
      deletedAt: null,
      nextPmDueDate: { lt: new Date() },
      assetStatus: { in: ['ACTIVE', 'IN_SERVICE'] },
      autoGenerateWorkOrders: true,
    },
  });

  const workOrders = await prisma.$transaction(
    overdueAssets.map(asset =>
      prisma.maintenanceHistory.create({
        data: {
          assetId: asset.id,
          workOrderType: 'PREVENTIVE_MAINTENANCE',
          workOrderStatus: 'PENDING',
          scheduledDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days out
          description: `Auto-generated PM work order for overdue maintenance. Last PM: ${asset.lastPmDate?.toISOString()}`,
          createdByUserId: adminUserId,
        },
      })
    )
  );

  return workOrders;
}
```

### Technician Workload

```typescript
const technicianWorkload = await prisma.user.findMany({
  where: {
    role: 'BIOMED_ENGINEER',
    isActive: true,
  },
  select: {
    id: true,
    firstName: true,
    lastName: true,
    assignedMaintenanceTasks: {
      where: {
        workOrderStatus: { in: ['ASSIGNED', 'IN_PROGRESS'] },
      },
      select: {
        id: true,
        workOrderStatus: true,
        asset: {
          select: {
            pmEstimatedDurationHours: true,
            department: {
              select: { name: true },
            },
          },
        },
      },
    },
  },
});

// Calculate workload metrics
const workload = technicianWorkload.map(tech => ({
  technicianName: `${tech.firstName} ${tech.lastName}`,
  assignedCount: tech.assignedMaintenanceTasks.filter(t => t.workOrderStatus === 'ASSIGNED').length,
  inProgressCount: tech.assignedMaintenanceTasks.filter(t => t.workOrderStatus === 'IN_PROGRESS').length,
  estimatedHours: tech.assignedMaintenanceTasks.reduce(
    (sum, t) => sum + (t.asset.pmEstimatedDurationHours?.toNumber() || 0),
    0
  ),
}));
```

---

## 🤖 PREDICTIVE ANALYTICS

### High-Risk Assets (Failure Prediction)

```typescript
const highRiskAssets = await prisma.asset.findMany({
  where: {
    deletedAt: null,
    assetStatus: { in: ['ACTIVE', 'IN_SERVICE'] },
    failureProbabilityScore: {
      gte: 70,
    },
  },
  include: {
    currentRoom: {
      select: { roomName: true },
    },
  },
  orderBy: [
    { failureProbabilityScore: 'desc' },
    { criticalityLevel: 'asc' },
  ],
  take: 50,
});
```

### Failure Trend Analysis

```typescript
const failureTrends = await prisma.asset.groupBy({
  by: ['deviceCategory', 'failureCategory'],
  where: {
    deletedAt: null,
    failureCountLifetime: {
      gt: 0,
    },
  },
  _count: {
    _all: true,
  },
  _avg: {
    mtbfHours: true,
    mttrHours: true,
    totalMaintenanceCostLifetime: true,
  },
  orderBy: {
    _count: {
      _all: 'desc',
    },
  },
});
```

### IoT Sensor Anomaly Detection

```typescript
// Get recent sensor readings with statistics
const recentReadings = await prisma.iotSensorReading.findMany({
  where: {
    timestamp: {
      gte: new Date(Date.now() - 60 * 60 * 1000), // Last hour
    },
    status: 'WARNING',
  },
  include: {
    asset: {
      select: {
        assetTagNumber: true,
        equipmentName: true,
      },
    },
  },
  orderBy: {
    timestamp: 'desc',
  },
});

// Group anomalies by asset
const anomalies = recentReadings.reduce((acc, reading) => {
  const key = reading.assetId;
  if (!acc[key]) {
    acc[key] = {
      asset: reading.asset,
      readings: [],
    };
  }
  acc[key].readings.push({
    sensorType: reading.sensorType,
    value: reading.value?.toNumber(),
    timestamp: reading.timestamp,
  });
  return acc;
}, {} as Record<string, any>);
```

---

## 📊 COMPLIANCE REPORTING

### Certification Expiry Report

```typescript
const ninetyDaysFromNow = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

const expiringCertifications = await prisma.complianceEvent.findMany({
  where: {
    certificationExpiryDate: {
      lte: ninetyDaysFromNow,
    },
  },
  include: {
    asset: {
      select: {
        assetTagNumber: true,
        equipmentName: true,
        udiDeviceIdentifier: true,
      },
    },
  },
  orderBy: {
    certificationExpiryDate: 'asc',
  },
});

// Categorize by urgency
const categorized = {
  expired: expiringCertifications.filter(c => c.certificationExpiryDate! < new Date()),
  urgent: expiringCertifications.filter(c => {
    const daysUntilExpiry = Math.floor(
      (c.certificationExpiryDate!.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysUntilExpiry >= 0 && daysUntilExpiry <= 30;
  }),
  upcoming: expiringCertifications.filter(c => {
    const daysUntilExpiry = Math.floor(
      (c.certificationExpiryDate!.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysUntilExpiry > 30 && daysUntilExpiry <= 90;
  }),
};
```

### Recall Status Report

```typescript
const assetsUnderRecall = await prisma.asset.findMany({
  where: {
    recallStatus: { in: ['CLASS_I', 'CLASS_II', 'CLASS_III'] },
    deletedAt: null,
  },
  include: {
    currentRoom: {
      select: { roomName: true },
    },
    custodian: {
      select: { firstName: true, lastName: true, email: true },
    },
  },
  orderBy: {
    recallStatus: 'asc', // CLASS_I first (most serious)
  },
});
```

### UDI Compliance Check

```typescript
const assetsWithMissingUDI = await prisma.asset.findMany({
  where: {
    deletedAt: null,
    OR: [
      { udiDeviceIdentifier: null },
      {
        AND: [
          { riskClassification: { in: ['CLASS_II', 'CLASS_III'] } },
          { fda510kNumber: null },
        ],
      },
    ],
  },
  select: {
    assetTagNumber: true,
    equipmentName: true,
    manufacturer: true,
    modelNumber: true,
    riskClassification: true,
    udiDeviceIdentifier: true,
    fda510kNumber: true,
  },
  orderBy: {
    riskClassification: 'asc',
  },
});
```

---

## 📈 UTILIZATION ANALYTICS

### Asset Utilization Dashboard

```typescript
const utilizationSummary = await prisma.asset.groupBy({
  by: ['deviceCategory'],
  where: {
    deletedAt: null,
    assetStatus: { in: ['ACTIVE', 'IN_SERVICE'] },
  },
  _count: {
    _all: true,
  },
  _avg: {
    utilizationRatePercent: true,
    totalUsageHours: true,
  },
});

// Count underutilized and high-demand assets
const detailedStats = await Promise.all(
  utilizationSummary.map(async (category) => {
    const [underutilized, highDemand] = await Promise.all([
      prisma.asset.count({
        where: {
          deviceCategory: category.deviceCategory,
          utilizationRatePercent: { lt: 20 },
          deletedAt: null,
        },
      }),
      prisma.asset.count({
        where: {
          deviceCategory: category.deviceCategory,
          utilizationRatePercent: { gt: 80 },
          deletedAt: null,
        },
      }),
    ]);

    return {
      category: category.deviceCategory,
      totalAssets: category._count._all,
      avgUtilization: category._avg.utilizationRatePercent,
      underutilizedCount: underutilized,
      highDemandCount: highDemand,
    };
  })
);
```

### Underutilized Assets (Cost Savings Opportunity)

```typescript
const underutilizedAssets = await prisma.asset.findMany({
  where: {
    deletedAt: null,
    assetStatus: { in: ['ACTIVE', 'IN_SERVICE'] },
    utilizationRatePercent: {
      lt: 30,
    },
  },
  include: {
    department: {
      select: { name: true },
    },
    currentRoom: {
      select: { roomName: true },
    },
  },
  orderBy: [
    { currentBookValue: 'desc' },
    { utilizationRatePercent: 'asc' },
  ],
});

// Add recommendations
const withRecommendations = underutilizedAssets.map(asset => ({
  ...asset,
  recommendation:
    asset.utilizationRatePercent! < 10
      ? 'Consider Retirement'
      : asset.utilizationRatePercent! < 20
      ? 'Redeploy to High-Demand Area'
      : 'Monitor',
}));
```

---

## 💰 FINANCIAL REPORTING

### Total Cost of Ownership (TCO)

```typescript
const tcoAnalysis = await prisma.asset.findMany({
  where: {
    deletedAt: null,
    purchaseDate: { not: null },
  },
  select: {
    assetTagNumber: true,
    equipmentName: true,
    purchaseDate: true,
    purchaseCost: true,
    currentBookValue: true,
    totalMaintenanceCostLifetime: true,
    totalDowntimeHoursLifetime: true,
    downtimeCostPerHour: true,
  },
  orderBy: {
    purchaseCost: 'desc',
  },
  take: 100,
});

// Calculate TCO metrics
const tcoMetrics = tcoAnalysis.map(asset => {
  const purchaseCost = asset.purchaseCost?.toNumber() || 0;
  const maintenanceCost = asset.totalMaintenanceCostLifetime?.toNumber() || 0;
  const downtimeCost =
    (asset.totalDowntimeHoursLifetime?.toNumber() || 0) *
    (asset.downtimeCostPerHour?.toNumber() || 0);
  const totalCost = purchaseCost + maintenanceCost + downtimeCost;

  const ageYears =
    (new Date().getTime() - asset.purchaseDate!.getTime()) / (1000 * 60 * 60 * 24 * 365);

  return {
    assetTag: asset.assetTagNumber,
    equipmentName: asset.equipmentName,
    purchaseCost,
    maintenanceCost,
    downtimeCost,
    totalCost,
    ageYears: ageYears.toFixed(1),
    annualTCO: ageYears > 0 ? totalCost / ageYears : 0,
  };
});
```

### Budget Planning (Replacement Forecast)

```typescript
const today = new Date();
const fiveYearsFromNow = new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000);

const assetsNearingEOL = await prisma.asset.findMany({
  where: {
    deletedAt: null,
    assetStatus: { in: ['ACTIVE', 'IN_SERVICE'] },
    purchaseDate: { not: null },
    usefulLifeYears: { not: null },
  },
  select: {
    assetTagNumber: true,
    equipmentName: true,
    purchaseDate: true,
    usefulLifeYears: true,
    estimatedReplacementCost: true,
  },
});

// Calculate replacement dates and group by year
const replacementForecast = assetsNearingEOL
  .map(asset => {
    const replacementDate = new Date(asset.purchaseDate!);
    replacementDate.setFullYear(replacementDate.getFullYear() + asset.usefulLifeYears!);

    return {
      ...asset,
      replacementDate,
      replacementYear: replacementDate.getFullYear(),
    };
  })
  .filter(asset => asset.replacementDate >= today && asset.replacementDate <= fiveYearsFromNow)
  .reduce((acc, asset) => {
    const year = asset.replacementYear;
    if (!acc[year]) {
      acc[year] = { year, assets: [], totalCost: 0 };
    }
    acc[year].assets.push(asset.equipmentName);
    acc[year].totalCost += asset.estimatedReplacementCost?.toNumber() || 0;
    return acc;
  }, {} as Record<number, any>);
```

---

## ⚡ PERFORMANCE OPTIMIZATION

### Batch Operations

```typescript
// Bad: N+1 queries
for (const assetId of assetIds) {
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
}

// Good: Single query
const assets = await prisma.asset.findMany({
  where: { id: { in: assetIds } },
});
```

### Pagination

```typescript
// Implement cursor-based pagination for large datasets
async function paginateAssets(cursor?: string, limit: number = 20) {
  const assets = await prisma.asset.findMany({
    take: limit + 1, // Fetch one extra to check if there are more
    cursor: cursor ? { id: cursor } : undefined,
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  const hasMore = assets.length > limit;
  const results = hasMore ? assets.slice(0, -1) : assets;

  return {
    assets: results,
    nextCursor: hasMore ? results[results.length - 1].id : null,
  };
}
```

### Select Only Needed Fields

```typescript
// Bad: Fetching all fields
const assets = await prisma.asset.findMany();

// Good: Select only needed fields
const assets = await prisma.asset.findMany({
  select: {
    id: true,
    assetTagNumber: true,
    equipmentName: true,
    assetStatus: true,
  },
});
```

### Use Transactions for Consistency

```typescript
async function transferAsset(assetId: string, newFacilityId: string, userId: string) {
  return await prisma.$transaction(async (tx) => {
    // Update asset
    const asset = await tx.asset.update({
      where: { id: assetId },
      data: {
        currentFacilityId: newFacilityId,
        updatedById: userId,
      },
    });

    // Log transfer
    await tx.transferHistory.create({
      data: {
        assetId,
        fromFacilityId: asset.currentFacilityId,
        toFacilityId: newFacilityId,
        initiatedByUserId: userId,
        transferDate: new Date(),
      },
    });

    // Create location history entry
    await tx.locationHistory.create({
      data: {
        assetId,
        facilityId: newFacilityId,
        timestamp: new Date(),
        trackingMethod: 'MANUAL',
        recordedByUserId: userId,
      },
    });

    return asset;
  });
}
```

---

**Document Version:** 2.0  
**Last Updated:** November 8, 2025  
**For:** BioTrakr with Prisma ORM

