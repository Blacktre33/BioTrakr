import { PrismaClient, AssetStatus, DeviceCategory, CriticalityLevel, RiskClassification, WorkOrderType, WorkOrderStatus, TrackingMethod } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database with V2 Schema...');

  // 1. Create Organization
  const organization = await prisma.organization.upsert({
    where: { id: 'org-demo-001' },
    update: {},
    create: {
      id: 'org-demo-001',
      name: 'Demo Hospital System',
      type: 'hospital_network',
      settings: {
        timezone: 'America/New_York',
        currency: 'USD',
      },
    },
  });
  console.log('✅ Organization created:', organization.name);

  // 2. Create Facility
  const facility = await prisma.facility.upsert({
    where: { facilityCode: 'MAIN_CAMPUS' },
    update: {},
    create: {
      id: 'fac-demo-001',
      organizationId: organization.id,
      facilityName: 'Main Medical Center',
      facilityCode: 'MAIN_CAMPUS',
      facilityType: 'General Hospital',
      addressLine1: '123 Medical Center Drive',
      city: 'Boston',
      stateProvince: 'MA',
      postalCode: '02115',
      country: 'USA',
      timezone: 'America/New_York',
    },
  });
  console.log('✅ Facility created:', facility.facilityName);

  // 3. Create Buildings & Floors
  const building = await prisma.building.create({
    data: {
      facilityId: facility.id,
      buildingCode: 'MAIN',
      buildingName: 'Main Tower',
      floors: {
        create: [
          { floorNumber: 1, floorName: 'Ground Floor' },
          { floorNumber: 3, floorName: 'ICU Level' },
          { floorNumber: 4, floorName: 'Med-Surg Level' },
        ],
      },
    },
  });
  
  const floors = await prisma.floor.findMany({ where: { buildingId: building.id } });
  const floorMap = Object.fromEntries(floors.map(f => [f.floorNumber, f.id]));

  // 4. Create Departments
  const deptED = await prisma.department.create({
    data: {
      facilityId: facility.id,
      departmentName: 'Emergency Department',
      departmentCode: 'ED',
      costCenter: 'CC-101',
    },
  });

  const deptICU = await prisma.department.create({
    data: {
      facilityId: facility.id,
      departmentName: 'Intensive Care Unit',
      departmentCode: 'ICU',
      costCenter: 'CC-201',
    },
  });

  const deptBiomed = await prisma.department.create({
    data: {
      facilityId: facility.id,
      departmentName: 'Clinical Engineering',
      departmentCode: 'BIOMED',
      costCenter: 'CC-901',
    },
  });

  // 5. Create Users
  const hashedPassword = await bcrypt.hash('Admin123!', 10);
  
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@demo.hospital.com' },
    update: {},
    create: {
      organizationId: organization.id,
      username: 'admin',
      email: 'admin@demo.hospital.com',
      passwordHash: hashedPassword,
      firstName: 'System',
      lastName: 'Admin',
      role: 'ADMIN',
      departmentId: deptBiomed.id,
    },
  });

  const techUser = await prisma.user.upsert({
    where: { email: 'tech@demo.hospital.com' },
    update: {},
    create: {
      organizationId: organization.id,
      username: 'biomed_tech',
      email: 'tech@demo.hospital.com',
      passwordHash: hashedPassword,
      firstName: 'Alex',
      lastName: 'Technician',
      role: 'TECHNICIAN',
      departmentId: deptBiomed.id,
    },
  });
  
  console.log('✅ Users created');

  // 6. Create Assets
  const asset1 = await prisma.asset.create({
    data: {
      organizationId: organization.id,
      assetTagNumber: 'IP-001',
      equipmentName: 'Infusion Pump - Alaris',
      manufacturer: 'BD',
      modelNumber: 'Alaris 8015',
      serialNumber: 'ALR-12345',
      deviceCategory: DeviceCategory.LIFE_SUPPORT,
      assetStatus: AssetStatus.ACTIVE,
      criticalityLevel: CriticalityLevel.CRITICAL,
      riskClassification: RiskClassification.CLASS_II,
      purchaseDate: new Date('2022-01-15'),
      purchaseCost: 5000.00,
      usefulLifeYears: 7,
      currentFacilityId: facility.id,
      currentBuildingId: building.id,
      currentFloorId: floorMap[1],
      primaryCustodianId: techUser.id,
      custodianDepartmentId: deptBiomed.id,
      createdById: adminUser.id,
      updatedById: adminUser.id,
      rfidTagId: 'RFID-001-ABC',
    },
  });

  const asset2 = await prisma.asset.create({
    data: {
      organizationId: organization.id,
      assetTagNumber: 'PM-001',
      equipmentName: 'Patient Monitor',
      manufacturer: 'Philips',
      modelNumber: 'IntelliVue MX800',
      serialNumber: 'PHL-67890',
      deviceCategory: DeviceCategory.PATIENT_MONITORING,
      assetStatus: AssetStatus.IN_SERVICE,
      criticalityLevel: CriticalityLevel.HIGH,
      riskClassification: RiskClassification.CLASS_II,
      purchaseDate: new Date('2021-06-10'),
      purchaseCost: 15000.00,
      usefulLifeYears: 10,
      currentFacilityId: facility.id,
      currentBuildingId: building.id,
      currentFloorId: floorMap[3],
      primaryCustodianId: techUser.id,
      custodianDepartmentId: deptICU.id,
      createdById: adminUser.id,
      updatedById: adminUser.id,
      bleBeaconMac: 'AA:BB:CC:11:22:33',
    },
  });

  console.log('✅ Assets created: 2');

  // 7. Create Location History
  await prisma.locationHistory.create({
    data: {
      assetId: asset1.id,
      facilityId: facility.id,
      buildingId: building.id,
      floorId: floorMap[1],
      trackingMethod: TrackingMethod.RFID,
      timestamp: new Date(),
      recordedByUserId: adminUser.id,
    },
  });

  // 8. Create Maintenance History
  await prisma.maintenanceHistory.create({
    data: {
      assetId: asset1.id,
      workOrderType: WorkOrderType.PREVENTIVE_MAINTENANCE,
      workOrderStatus: WorkOrderStatus.PENDING,
      scheduledDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      description: 'Annual PM Service',
      assignedTechnicianId: techUser.id,
      createdByUserId: adminUser.id,
    },
  });

  console.log('🎉 Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
