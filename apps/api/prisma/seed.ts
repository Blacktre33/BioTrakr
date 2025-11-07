import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const organization = await prisma.organization.upsert({
    where: { id: 'org-demo-001' },
    update: {},
    create: {
      id: 'org-demo-001',
      name: 'Demo Hospital',
      type: 'hospital',
      settings: {
        timezone: 'America/New_York',
        currency: 'USD',
      },
    },
  });
  console.log('✅ Organization created:', organization.name);

  const facility = await prisma.facility.upsert({
    where: { id: 'fac-demo-001' },
    update: {},
    create: {
      id: 'fac-demo-001',
      organizationId: organization.id,
      name: 'Main Campus',
      address: {
        street: '123 Medical Center Drive',
        city: 'Boston',
        state: 'MA',
        zip: '02115',
        country: 'USA',
      },
      timezone: 'America/New_York',
    },
  });
  console.log('✅ Facility created:', facility.name);

  const departments = await Promise.all([
    prisma.department.upsert({
      where: { id: 'dept-demo-001' },
      update: {},
      create: {
        id: 'dept-demo-001',
        facilityId: facility.id,
        name: 'Emergency Department',
        code: 'ED',
        floor: 1,
      },
    }),
    prisma.department.upsert({
      where: { id: 'dept-demo-002' },
      update: {},
      create: {
        id: 'dept-demo-002',
        facilityId: facility.id,
        name: 'Intensive Care Unit',
        code: 'ICU',
        floor: 3,
      },
    }),
    prisma.department.upsert({
      where: { id: 'dept-demo-003' },
      update: {},
      create: {
        id: 'dept-demo-003',
        facilityId: facility.id,
        name: 'Medical-Surgical',
        code: 'MEDSURG',
        floor: 4,
      },
    }),
  ]);
  console.log('✅ Departments created:', departments.length);

  const hashedPassword = await bcrypt.hash('Admin123!', 10);
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@demo.hospital.com' },
    update: {},
    create: {
      organizationId: organization.id,
      email: 'admin@demo.hospital.com',
      password: hashedPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      isActive: true,
    },
  });
  console.log('✅ Admin user created:', adminUser.email);

  const technicianUser = await prisma.user.upsert({
    where: { email: 'tech@demo.hospital.com' },
    update: {},
    create: {
      organizationId: organization.id,
      email: 'tech@demo.hospital.com',
      password: await bcrypt.hash('Tech123!', 10),
      firstName: 'Biomed',
      lastName: 'Technician',
      role: 'technician',
      isActive: true,
    },
  });
  console.log('✅ Technician user created:', technicianUser.email);

  const assets = await Promise.all([
    prisma.asset.create({
      data: {
        organizationId: organization.id,
        facilityId: facility.id,
        departmentId: departments[0].id,
        name: 'Infusion Pump - Alaris',
        assetTag: 'IP-001',
        serialNumber: 'ALR-12345',
        category: 'infusion_pump',
        manufacturer: 'BD',
        model: 'Alaris 8015',
        purchaseDate: new Date('2022-01-15'),
        purchaseCost: 5000.0,
        status: 'available',
        condition: 'excellent',
        currentLocation: {
          building: 'Main',
          floor: 1,
          room: 'ED-101',
        },
        tags: ['critical', 'portable'],
      },
    }),
    prisma.asset.create({
      data: {
        organizationId: organization.id,
        facilityId: facility.id,
        departmentId: departments[1].id,
        name: 'Patient Monitor',
        assetTag: 'PM-001',
        serialNumber: 'PHL-67890',
        category: 'monitor',
        manufacturer: 'Philips',
        model: 'IntelliVue MX800',
        purchaseDate: new Date('2021-06-10'),
        purchaseCost: 15000.0,
        status: 'in_use',
        condition: 'good',
        currentLocation: {
          building: 'Main',
          floor: 3,
          room: 'ICU-302',
        },
        tags: ['critical', 'stationary'],
      },
    }),
    prisma.asset.create({
      data: {
        organizationId: organization.id,
        facilityId: facility.id,
        departmentId: departments[2].id,
        name: 'Wheelchair',
        assetTag: 'WC-001',
        serialNumber: 'INV-11111',
        category: 'wheelchair',
        manufacturer: 'Invacare',
        model: 'Tracer SX5',
        purchaseDate: new Date('2023-03-20'),
        purchaseCost: 500.0,
        status: 'available',
        condition: 'good',
        currentLocation: {
          building: 'Main',
          floor: 4,
          room: 'MS-Hallway',
        },
        tags: ['portable'],
      },
    }),
  ]);
  console.log('✅ Sample assets created:', assets.length);

  const now = new Date();
  const locationSeeds = assets.flatMap((asset, index) => {
    const baseLat = 42.3467 + index * 0.001;
    const baseLng = -71.0972 - index * 0.001;

    return Array.from({ length: 6 }).map((_, offset) => ({
      assetId: asset.id,
      latitude: Number((baseLat + offset * 0.0002).toFixed(6)),
      longitude: Number((baseLng + offset * 0.00015).toFixed(6)),
      status: offset % 3 === 0 ? 'maintenance' : asset.status,
      observedAt: new Date(now.getTime() - offset * 5 * 60 * 1000),
      metadata: {
        batteryLevel: 100 - offset * 3,
        signalStrength: ['excellent', 'good', 'fair'][offset % 3],
      },
    }));
  });

  await prisma.assetLocationPing.createMany({ data: locationSeeds });
  console.log('✅ Location telemetry generated:', locationSeeds.length);

  const maintenanceTasks = await prisma.maintenanceTask.createMany({
    data: [
      {
        assetId: assets[0].id,
        requestedById: adminUser.id,
        assignedToId: technicianUser.id,
        status: 'scheduled',
        priority: 'high',
        summary: 'Infusion pump preventive maintenance',
        details: 'Run standard PM checklist and verify calibration.',
        scheduledFor: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      },
      {
        assetId: assets[1].id,
        requestedById: adminUser.id,
        assignedToId: technicianUser.id,
        status: 'in_progress',
        priority: 'medium',
        summary: 'Monitor alarm investigation',
        details: 'Nurse reported intermittent high-pressure alarm during overnight shift.',
        scheduledFor: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      },
      {
        assetId: assets[2].id,
        requestedById: adminUser.id,
        assignedToId: null,
        status: 'completed',
        priority: 'low',
        summary: 'Wheelchair wheel replacement',
        details: 'Front caster replaced and alignment verified.',
        scheduledFor: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
        completedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      },
    ],
  });
  console.log('✅ Maintenance tasks created:', maintenanceTasks.count);

  console.log('🎉 Seeding completed successfully!');
}

main()
  .catch((error) => {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
