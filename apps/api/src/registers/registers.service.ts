import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AssetStatus, Prisma } from '@prisma/client';

import { describeLocation, LOCATION_SELECT } from '../assets/location';
import type { AuthUser } from '../auth/auth-user';
import { contractStatus } from '../contracts/contract-status';
import { PrismaService } from '../database/prisma.service';
import { documentCounts } from '../documents/documents.service';
import type { RegisterKind, RegisterQuery } from './registers.dto';
import {
  day,
  dayTime,
  deviceCell,
  duration,
  MAX_ROWS,
  name,
  num,
  numbered,
  PROVIDER_LABEL,
  rupees,
  SL,
  STATUS_LABEL,
  type Register,
  type RegisterColumn,
  type RegisterRow,
} from './register-format';

const DAY = 24 * 60 * 60 * 1000;
/** A year back, when no period is given. */
const DEFAULT_PERIOD_DAYS = 365;

const FUNCTIONAL: AssetStatus[] = ['ACTIVE', 'IN_SERVICE'];
const REPAIRABLE: AssetStatus[] = ['IN_MAINTENANCE', 'QUARANTINED'];
const BREAKDOWNS = ['CORRECTIVE_MAINTENANCE', 'EMERGENCY_REPAIR'] as const;

const yesNo = (n: number) => (n > 0 ? 'Yes' : 'No');

/** "2026-04-01" is that day here, not midnight UTC. */
function localDay(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(value);
}

interface Scope {
  organizationId: string;
  facilityId?: string;
  from: Date;
  to: Date;
}

type Body = Pick<Register, 'title' | 'basis' | 'columns' | 'notes'> & {
  rows: RegisterRow[];
  /** As of today, not over a period. */
  snapshot?: boolean;
  device?: string | null;
};

/**
 * Printable registers for NABH assessment and the NHSRC formats: the
 * inventory master record (Annexure F), the annual inventory survey
 * (Annexure D), each device's maintenance logbook (Annexure E), and the
 * calibration, electrical safety, PM, breakdown and AMC/CMC registers.
 * Every value is formatted here, so the printed page and the CSV agree.
 */
@Injectable()
export class RegistersService {
  constructor(private readonly prisma: PrismaService) {}

  async build(
    kind: RegisterKind,
    query: RegisterQuery,
    user: AuthUser,
  ): Promise<Register> {
    const to = query.to ? localDay(query.to) : new Date();
    const from = query.from
      ? localDay(query.from)
      : new Date(to.getTime() - DEFAULT_PERIOD_DAYS * DAY);
    if (from > to) {
      throw new BadRequestException('The period must start before it ends');
    }
    // Whole days: from the start of the first to the end of the last.
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
    const scope: Scope = {
      organizationId: user.organizationId,
      facilityId: query.facilityId,
      from,
      to,
    };

    const [organization, facility] = await Promise.all([
      this.prisma.organization.findFirst({
        where: { id: user.organizationId },
        select: { name: true },
      }),
      query.facilityId
        ? this.prisma.facility.findFirst({
            where: {
              id: query.facilityId,
              organizationId: user.organizationId,
            },
            select: { facilityName: true },
          })
        : null,
    ]);
    if (query.facilityId && !facility) {
      throw new NotFoundException('Facility not found');
    }

    const body = await this.body(kind, scope, query);
    const rows = body.rows.slice(0, MAX_ROWS);
    return {
      kind,
      title: body.title,
      basis: body.basis,
      organization: organization?.name ?? '',
      facility: facility?.facilityName ?? null,
      period: body.snapshot ? null : { from: day(from)!, to: day(to)! },
      device: body.device ?? null,
      generatedAt: dayTime(new Date())!,
      columns: [SL, ...body.columns],
      rows: numbered(rows),
      truncated: body.rows.length > MAX_ROWS,
      notes: body.notes,
    };
  }

  private body(kind: RegisterKind, s: Scope, q: RegisterQuery): Promise<Body> {
    switch (kind) {
      case 'inventory':
        return this.inventory(s);
      case 'survey':
        return this.survey(s);
      case 'logbook':
        if (!q.assetId) {
          throw new BadRequestException('Choose the device for its logbook');
        }
        return this.logbook(s, q.assetId);
      case 'calibration':
        return this.calibration(s);
      case 'safety':
        return this.safety(s);
      case 'pm':
        return this.pm(s);
      case 'breakdown':
        return this.breakdown(s);
      case 'contracts':
        return this.contracts(s);
    }
  }

  private devices(s: Scope): Prisma.AssetWhereInput {
    return {
      organizationId: s.organizationId,
      deletedAt: null,
      ...(s.facilityId ? { currentFacilityId: s.facilityId } : {}),
    };
  }

  /** NHSRC Annexure F: one line per device held. */
  private async inventory(s: Scope): Promise<Body> {
    const now = new Date();
    const assets = await this.prisma.asset.findMany({
      where: { ...this.devices(s), assetStatus: { not: 'DISPOSED' } },
      orderBy: [{ assetTagNumber: 'asc' }],
      take: MAX_ROWS + 1,
      select: {
        assetTagNumber: true,
        equipmentName: true,
        manufacturer: true,
        modelNumber: true,
        serialNumber: true,
        installationDate: true,
        purchaseDate: true,
        warrantyEndDate: true,
        assetStatus: true,
        ...LOCATION_SELECT,
        serviceContracts: {
          select: {
            contract: {
              select: {
                contractType: true,
                startDate: true,
                endDate: true,
                terminatedAt: true,
              },
            },
          },
        },
      },
    });
    const columns: RegisterColumn[] = [
      { key: 'ref', label: 'Ref ID' },
      { key: 'name', label: 'Equipment Nomenclature' },
      { key: 'qty', label: 'Qty', align: 'right' },
      { key: 'make', label: 'Make/model (Sl. Num)' },
      { key: 'location', label: 'Location' },
      { key: 'received', label: 'Date installed/received' },
      { key: 'warranty', label: 'Warranty Valid Till' },
      { key: 'amc', label: 'CAMC/AMC Valid Till' },
      { key: 'status', label: 'Current Status/Remarks' },
    ];
    const rows = assets.map((a) => {
      // The contract in force (or starting next), latest end first.
      const cover = a.serviceContracts
        .map((sc) => sc.contract)
        .filter((c) => {
          const st = contractStatus(c, now);
          return st === 'active' || st === 'upcoming';
        })
        .sort((x, y) => y.endDate.getTime() - x.endDate.getTime())[0];
      return {
        ref: a.assetTagNumber,
        name: a.equipmentName,
        qty: 1,
        make: `${a.manufacturer} ${a.modelNumber}${a.serialNumber ? ` (Sl. ${a.serialNumber})` : ''}`,
        location: describeLocation(a),
        received: day(a.installationDate ?? a.purchaseDate),
        warranty: day(a.warrantyEndDate),
        amc: cover ? `${cover.contractType} to ${day(cover.endDate)}` : null,
        status: STATUS_LABEL[a.assetStatus],
      };
    });
    return {
      title: 'Inventory Master Record',
      basis:
        'NHSRC Guidelines on Equipment Maintenance, Calibration and Testing, Annexure F',
      columns,
      rows,
      snapshot: true,
      notes: [
        'One line per device. Disposed devices are not listed; condemned ones are, until disposed.',
      ],
    };
  }

  /** NHSRC Annexure D: counts by department and equipment. */
  private async survey(s: Scope): Promise<Body> {
    const assets = await this.prisma.asset.findMany({
      where: { ...this.devices(s), assetStatus: { not: 'DISPOSED' } },
      take: 50_000,
      select: {
        equipmentName: true,
        assetStatus: true,
        custodianDepartment: { select: { departmentName: true } },
      },
    });
    const groups = new Map<
      string,
      { department: string; name: string; statuses: AssetStatus[] }
    >();
    for (const a of assets) {
      const department = a.custodianDepartment?.departmentName ?? '—';
      const key = `${department}\u0000${a.equipmentName.trim().toLowerCase()}`;
      const g = groups.get(key) ?? {
        department,
        name: a.equipmentName.trim(),
        statuses: [],
      };
      g.statuses.push(a.assetStatus);
      groups.set(key, g);
    }
    const count = (st: AssetStatus[], of: AssetStatus[]) =>
      st.filter((x) => of.includes(x)).length;
    const rows = [...groups.values()]
      .sort(
        (x, y) =>
          x.department.localeCompare(y.department) ||
          x.name.localeCompare(y.name),
      )
      .map((g) => {
        const retired = count(g.statuses, ['RETIRED']);
        return {
          department: g.department,
          name: g.name,
          held: g.statuses.length,
          functional: count(g.statuses, FUNCTIONAL),
          nonFunctional: g.statuses.length - count(g.statuses, FUNCTIONAL),
          repairable: count(g.statuses, REPAIRABLE),
          ber: count(g.statuses, ['CONDEMNED']),
          remarks: retired ? `${retired} retired` : null,
        };
      });
    return {
      title: 'Annual Equipment Inventory Survey',
      basis:
        'NHSRC Guidelines on Equipment Maintenance, Calibration and Testing, Annexure D',
      columns: [
        { key: 'department', label: 'Department' },
        { key: 'name', label: 'Equipment Nomenclature' },
        { key: 'held', label: 'Quantity Held (Total)', align: 'right' },
        { key: 'functional', label: 'Functional', align: 'right' },
        { key: 'nonFunctional', label: 'Non-Functional', align: 'right' },
        { key: 'repairable', label: 'Repairable', align: 'right' },
        { key: 'ber', label: 'BER', align: 'right' },
        { key: 'remarks', label: 'Remarks' },
      ],
      rows,
      snapshot: true,
      notes: [
        'Functional: in use. Repairable: under repair or quarantined. BER: condemned, beyond economical repair.',
        'Facility level and HEMC members are filled in by hand below.',
      ],
    };
  }

  /** NHSRC Annexure E: one device's maintenance, breakdowns and checks. */
  private async logbook(s: Scope, assetId: string): Promise<Body> {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, ...this.devices(s) },
      select: {
        assetTagNumber: true,
        equipmentName: true,
        manufacturer: true,
        modelNumber: true,
        serialNumber: true,
        ...LOCATION_SELECT,
      },
    });
    if (!asset) throw new NotFoundException('Device not found');
    const inPeriod = { gte: s.from, lte: s.to };
    const [orders, calibrations, tests] = await Promise.all([
      this.prisma.maintenanceHistory.findMany({
        where: {
          assetId,
          workOrderStatus: { not: 'CANCELLED' },
          OR: [{ createdAt: inPeriod }, { completedAt: inPeriod }],
        },
        orderBy: { createdAt: 'asc' },
        take: MAX_ROWS + 1,
        select: {
          workOrderType: true,
          workOrderStatus: true,
          createdAt: true,
          completedAt: true,
          workPerformed: true,
          description: true,
          assignedTechnician: { select: { firstName: true, lastName: true } },
          // The result of a calibration or safety test done on this order.
          calibrationRecords: {
            where: { supersededBy: null },
            select: { result: true, certificateNumber: true },
          },
          safetyTestRecords: {
            where: { supersededBy: null },
            select: { passed: true },
          },
        },
      }),
      // Recorded without a work order (e.g. an existing certificate).
      this.prisma.calibrationRecord.findMany({
        where: {
          assetId,
          workOrderId: null,
          supersededBy: null,
          calibratedAt: inPeriod,
        },
        select: {
          calibratedAt: true,
          result: true,
          provider: true,
          providerName: true,
          certificateNumber: true,
          recordedBy: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.safetyTestRecord.findMany({
        where: {
          assetId,
          workOrderId: null,
          supersededBy: null,
          testedAt: inPeriod,
        },
        select: {
          testedAt: true,
          passed: true,
          recordedBy: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);

    const KIND: Record<string, string> = {
      PREVENTIVE_MAINTENANCE: 'PM',
      CALIBRATION: 'Calibration',
      ELECTRICAL_SAFETY_TEST: 'Electrical safety test',
      INSPECTION: 'Inspection',
      INSTALLATION: 'Installation',
      DECOMMISSIONING: 'Decommissioning',
    };
    const entries: Array<{ at: Date; row: RegisterRow }> = [];
    for (const o of orders) {
      const by = name(o.assignedTechnician);
      if ((BREAKDOWNS as readonly string[]).includes(o.workOrderType)) {
        entries.push({
          at: o.createdAt,
          row: {
            check: null,
            remarks:
              [o.description, o.workPerformed].filter(Boolean).join(' — ') ||
              null,
            breakdown: dayTime(o.createdAt),
            rectified: o.completedAt
              ? `${dayTime(o.completedAt)}${by ? ` by ${by}` : ''}`
              : 'Not yet rectified',
            downtime: o.completedAt
              ? duration(o.createdAt, o.completedAt)
              : null,
            hod: null,
          },
        });
      } else {
        const [cal] = o.calibrationRecords;
        const [test] = o.safetyTestRecords;
        const result = cal
          ? `, ${cal.result.toLowerCase()}`
          : test
            ? `, ${test.passed ? 'passed' : 'failed'}`
            : '';
        entries.push({
          at: o.completedAt ?? o.createdAt,
          row: {
            check: o.completedAt
              ? `${KIND[o.workOrderType] ?? o.workOrderType} done ${day(o.completedAt)}${by ? ` by ${by}` : ''}${result}`
              : `${KIND[o.workOrderType] ?? o.workOrderType} due (open)`,
            remarks:
              [
                o.workPerformed,
                cal?.certificateNumber
                  ? `certificate ${cal.certificateNumber}`
                  : null,
              ]
                .filter(Boolean)
                .join(', ') || null,
            breakdown: null,
            rectified: null,
            downtime: null,
            hod: null,
          },
        });
      }
    }
    for (const c of calibrations) {
      entries.push({
        at: c.calibratedAt,
        row: {
          check: `Calibration ${day(c.calibratedAt)}, ${c.result.toLowerCase()}`,
          remarks: [
            c.providerName ?? PROVIDER_LABEL[c.provider],
            c.certificateNumber ? `certificate ${c.certificateNumber}` : null,
            `recorded by ${name(c.recordedBy)}`,
          ]
            .filter(Boolean)
            .join(', '),
          breakdown: null,
          rectified: null,
          downtime: null,
          hod: null,
        },
      });
    }
    for (const t of tests) {
      entries.push({
        at: t.testedAt,
        row: {
          check: `Electrical safety test ${day(t.testedAt)}, ${t.passed ? 'passed' : 'failed'}`,
          remarks: `recorded by ${name(t.recordedBy)}`,
          breakdown: null,
          rectified: null,
          downtime: null,
          hod: null,
        },
      });
    }
    entries.sort((x, y) => x.at.getTime() - y.at.getTime());

    return {
      title: 'Equipment Maintenance Logbook',
      basis:
        'NHSRC Guidelines on Equipment Maintenance, Calibration and Testing, Annexure E',
      device: `${asset.assetTagNumber} · ${asset.equipmentName} · ${asset.manufacturer} ${asset.modelNumber}${asset.serialNumber ? ` (Sl. ${asset.serialNumber})` : ''} · ${describeLocation(asset)}`,
      columns: [
        { key: 'check', label: 'Preventive Maintenance/Calibration' },
        { key: 'remarks', label: 'Remarks of Service Engineer' },
        { key: 'breakdown', label: 'Breakdown (Date/Time)' },
        {
          key: 'rectified',
          label: 'Rectified on (Date/Time) by Service Engineer',
        },
        { key: 'downtime', label: 'Total Breakdown Time', align: 'right' },
        { key: 'hod', label: 'Remarks/Sign of HoD', blank: true },
      ],
      rows: entries.map((e) => e.row),
      notes: [],
    };
  }

  /** NABH FMS.5: calibrations, the latest version of each record. */
  private async calibration(s: Scope): Promise<Body> {
    const records = await this.prisma.calibrationRecord.findMany({
      where: {
        supersededBy: null,
        calibratedAt: { gte: s.from, lte: s.to },
        asset: this.devices(s),
      },
      orderBy: [{ calibratedAt: 'asc' }, { id: 'asc' }],
      take: MAX_ROWS + 1,
      select: {
        id: true,
        calibratedAt: true,
        provider: true,
        providerName: true,
        labAccreditationNumber: true,
        certificateNumber: true,
        measurementUncertainty: true,
        referenceStandards: true,
        validUntil: true,
        result: true,
        supersedesId: true,
        asset: {
          select: {
            assetTagNumber: true,
            equipmentName: true,
            nextCalibrationDue: true,
            ...LOCATION_SELECT,
          },
        },
      },
    });
    const files = await this.fileCounts(
      'calibrationRecordId',
      records.map((r) => r.id),
    );
    const RESULT = {
      PASS: 'Pass',
      ADJUSTED: 'Adjusted, now in tolerance',
      FAIL: 'Fail',
    };
    return {
      title: 'Calibration Register',
      basis: 'NABH FMS.5; NHSRC calibration guidelines',
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'device', label: 'Equipment' },
        { key: 'location', label: 'Location' },
        { key: 'by', label: 'Calibrated by' },
        { key: 'nabl', label: 'NABL accreditation no.' },
        { key: 'certificate', label: 'Certificate no.' },
        { key: 'uncertainty', label: 'Measurement uncertainty / reference' },
        { key: 'result', label: 'Result' },
        { key: 'due', label: 'Valid till / next due' },
        { key: 'file', label: 'Certificate on file' },
      ],
      rows: records.map((r) => ({
        date: day(r.calibratedAt),
        device: deviceCell(r.asset),
        location: describeLocation(r.asset),
        by: r.providerName
          ? `${r.providerName} (${PROVIDER_LABEL[r.provider].toLowerCase()})`
          : PROVIDER_LABEL[r.provider],
        nabl: r.labAccreditationNumber,
        certificate: r.certificateNumber,
        uncertainty: r.measurementUncertainty ?? r.referenceStandards,
        result: `${RESULT[r.result]}${r.supersedesId ? ' (corrected record)' : ''}`,
        due: day(r.validUntil ?? r.asset.nextCalibrationDue),
        file: yesNo(files.get(r.id) ?? 0),
      })),
      notes: [
        'The latest version of each record; corrected records keep their originals on file in BioTrakr.',
      ],
    };
  }

  /** NABH FMS.3/FMS.5: electrical safety tests to IS/IEC 62353. */
  private async safety(s: Scope): Promise<Body> {
    const records = await this.prisma.safetyTestRecord.findMany({
      where: {
        supersededBy: null,
        testedAt: { gte: s.from, lte: s.to },
        asset: this.devices(s),
      },
      orderBy: [{ testedAt: 'asc' }, { id: 'asc' }],
      take: MAX_ROWS + 1,
      select: {
        id: true,
        testedAt: true,
        reason: true,
        provider: true,
        providerName: true,
        analyzer: true,
        electricalClass: true,
        appliedPartType: true,
        earthResistanceOhm: true,
        equipmentLeakageUa: true,
        appliedPartLeakageUa: true,
        passed: true,
        supersedesId: true,
        asset: {
          select: {
            assetTagNumber: true,
            equipmentName: true,
            nextSafetyInspectionDue: true,
            ...LOCATION_SELECT,
          },
        },
      },
    });
    const files = await this.fileCounts(
      'safetyTestRecordId',
      records.map((r) => r.id),
    );
    const CLASS = {
      CLASS_I: 'Class I',
      CLASS_II: 'Class II',
      INTERNALLY_POWERED: 'Internally powered',
    };
    const REASON = {
      ROUTINE: 'Routine',
      AFTER_REPAIR: 'After repair',
      ACCEPTANCE: 'Acceptance',
    };
    const reading = (v: number | null) => (v === null ? null : v);
    return {
      title: 'Electrical Safety Test Register',
      basis: 'NABH FMS.3.c and FMS.5; IS/IEC 62353',
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'device', label: 'Equipment' },
        { key: 'location', label: 'Location' },
        { key: 'class', label: 'Class / applied parts' },
        { key: 'reason', label: 'Reason' },
        { key: 'by', label: 'Tested by / analyser' },
        { key: 'earth', label: 'Earth resistance (Ω)', align: 'right' },
        { key: 'leakage', label: 'Equipment leakage (µA)', align: 'right' },
        { key: 'patient', label: 'Applied part leakage (µA)', align: 'right' },
        { key: 'result', label: 'Result' },
        { key: 'due', label: 'Next due' },
        { key: 'file', label: 'Report on file' },
      ],
      rows: records.map((r) => ({
        date: day(r.testedAt),
        device: deviceCell(r.asset),
        location: describeLocation(r.asset),
        class: `${CLASS[r.electricalClass]}${r.appliedPartType !== 'NONE' ? `, type ${r.appliedPartType}` : ''}`,
        reason: REASON[r.reason],
        by: `${r.providerName ?? PROVIDER_LABEL[r.provider]}; ${r.analyzer}`,
        earth: reading(r.earthResistanceOhm),
        leakage: reading(r.equipmentLeakageUa),
        patient: reading(r.appliedPartLeakageUa),
        result: `${r.passed ? 'Pass' : 'Fail'}${r.supersedesId ? ' (corrected record)' : ''}`,
        due: day(r.asset.nextSafetyInspectionDue),
        file: yesNo(files.get(r.id) ?? 0),
      })),
      notes: [
        'Limits are those of IS/IEC 62353 for the class, applied parts and method recorded.',
      ],
    };
  }

  /** NABH FMS.5: planned maintenance due or done in the period. */
  private async pm(s: Scope): Promise<Body> {
    const inPeriod = { gte: s.from, lte: s.to };
    const orders = await this.prisma.maintenanceHistory.findMany({
      where: {
        workOrderType: 'PREVENTIVE_MAINTENANCE',
        asset: this.devices(s),
        OR: [{ dueDate: inPeriod }, { completedAt: inPeriod }],
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      take: MAX_ROWS + 1,
      select: {
        dueDate: true,
        scheduledDate: true,
        completedAt: true,
        workOrderStatus: true,
        workPerformed: true,
        assignedTechnician: { select: { firstName: true, lastName: true } },
        asset: {
          select: {
            assetTagNumber: true,
            equipmentName: true,
            ...LOCATION_SELECT,
          },
        },
      },
    });
    const now = new Date();
    const status = (o: (typeof orders)[number]) => {
      const due = o.dueDate ?? o.scheduledDate;
      if (o.workOrderStatus === 'CANCELLED') return 'Cancelled';
      if (o.completedAt) {
        return o.completedAt.getTime() <= due.getTime() + DAY
          ? 'Done on time'
          : 'Done late';
      }
      return due < now ? 'Overdue' : 'Open';
    };
    return {
      title: 'Preventive Maintenance Register',
      basis: 'NABH FMS.5',
      columns: [
        { key: 'device', label: 'Equipment' },
        { key: 'location', label: 'Location' },
        { key: 'due', label: 'Due' },
        { key: 'done', label: 'Done on' },
        { key: 'by', label: 'Done by' },
        { key: 'remarks', label: 'Work done' },
        { key: 'status', label: 'Status' },
      ],
      rows: orders.map((o) => ({
        device: deviceCell(o.asset),
        location: describeLocation(o.asset),
        due: day(o.dueDate ?? o.scheduledDate),
        done: day(o.completedAt),
        by: o.completedAt ? name(o.assignedTechnician) : null,
        remarks: o.workPerformed,
        status: status(o),
      })),
      notes: [],
    };
  }

  /** NABH complaint/breakdown register: reported to rectified. */
  private async breakdown(s: Scope): Promise<Body> {
    const orders = await this.prisma.maintenanceHistory.findMany({
      where: {
        workOrderType: { in: [...BREAKDOWNS] },
        asset: this.devices(s),
        createdAt: { gte: s.from, lte: s.to },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: MAX_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        workOrderStatus: true,
        isEmergency: true,
        description: true,
        workPerformed: true,
        failureCategory: true,
        createdBy: { select: { firstName: true, lastName: true } },
        assignedTechnician: { select: { firstName: true, lastName: true } },
        asset: {
          select: {
            assetTagNumber: true,
            equipmentName: true,
            ...LOCATION_SELECT,
          },
        },
      },
    });
    const STATUS: Record<string, string> = {
      COMPLETED: 'Rectified',
      CANCELLED: 'Cancelled',
      AWAITING_PARTS: 'Waiting for parts',
    };
    const title = (v: string | null) =>
      v ? v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, ' ') : null;
    return {
      title: 'Breakdown (Complaint) Register',
      basis: 'NABH FMS.5; NHSRC BMMP Model RFP',
      columns: [
        { key: 'no', label: 'Complaint no.' },
        { key: 'reported', label: 'Reported (date/time)' },
        { key: 'device', label: 'Equipment' },
        { key: 'location', label: 'Location' },
        { key: 'problem', label: 'Problem reported' },
        { key: 'reporter', label: 'Reported by' },
        { key: 'attended', label: 'Attended' },
        { key: 'rectified', label: 'Rectified (by)' },
        { key: 'downtime', label: 'Downtime', align: 'right' },
        { key: 'cause', label: 'Cause' },
        { key: 'action', label: 'Action taken' },
        { key: 'status', label: 'Status' },
      ],
      rows: orders.map((o) => {
        const by = name(o.assignedTechnician);
        return {
          no: o.id.slice(0, 8).toUpperCase(),
          reported: `${dayTime(o.createdAt)}${o.isEmergency ? ' (urgent)' : ''}`,
          device: deviceCell(o.asset),
          location: describeLocation(o.asset),
          problem: o.description,
          reporter: name(o.createdBy),
          attended: dayTime(o.startedAt),
          rectified: o.completedAt
            ? `${dayTime(o.completedAt)}${by ? ` (${by})` : ''}`
            : null,
          downtime:
            o.workOrderStatus === 'CANCELLED'
              ? null
              : duration(o.createdAt, o.completedAt ?? new Date()) +
                (o.completedAt ? '' : ' so far'),
          cause: title(o.failureCategory),
          action: o.workPerformed,
          status: STATUS[o.workOrderStatus] ?? 'Open',
        };
      }),
      notes: ['Downtime runs from the report to the device being rectified.'],
    };
  }

  /** AMC/CMC contracts in force at any time in the period. */
  private async contracts(s: Scope): Promise<Body> {
    const contracts = await this.prisma.serviceContract.findMany({
      where: {
        organizationId: s.organizationId,
        startDate: { lte: s.to },
        endDate: { gte: s.from },
        ...(s.facilityId
          ? {
              devices: { some: { asset: { currentFacilityId: s.facilityId } } },
            }
          : {}),
      },
      orderBy: [{ endDate: 'asc' }, { id: 'asc' }],
      take: MAX_ROWS + 1,
      select: {
        id: true,
        contractType: true,
        contractNumber: true,
        startDate: true,
        endDate: true,
        annualValue: true,
        responseTimeHours: true,
        pmVisitsPerYear: true,
        terminatedAt: true,
        terminationReason: true,
        vendor: { select: { vendorName: true, phone: true } },
        devices: { select: { asset: { select: { assetTagNumber: true } } } },
      },
    });
    const files = await this.fileCounts(
      'contractId',
      contracts.map((c) => c.id),
    );
    const now = new Date();
    const STATUS = {
      active: 'In force',
      upcoming: 'Not yet started',
      expired: 'Expired',
      terminated: 'Ended early',
    };
    return {
      title: 'AMC/CMC Register',
      basis: 'NABH FMS.5; NHSRC guidelines (renew three months before expiry)',
      columns: [
        { key: 'vendor', label: 'Vendor' },
        { key: 'type', label: 'Type' },
        { key: 'number', label: 'Contract no.' },
        { key: 'from', label: 'From' },
        { key: 'to', label: 'To' },
        { key: 'devices', label: 'Equipment covered' },
        { key: 'value', label: 'Cost per year', align: 'right' },
        { key: 'terms', label: 'Response / PM visits' },
        { key: 'status', label: 'Status' },
        { key: 'file', label: 'Signed copy on file' },
      ],
      rows: contracts.map((c) => {
        const tags = c.devices.map((d) => d.asset.assetTagNumber).sort();
        return {
          vendor: `${c.vendor.vendorName}${c.vendor.phone ? ` (${c.vendor.phone})` : ''}`,
          type: c.contractType,
          number: c.contractNumber,
          from: day(c.startDate),
          to: day(c.endDate),
          devices: `${tags.length}: ${tags.slice(0, 8).join(', ')}${tags.length > 8 ? ` and ${tags.length - 8} more` : ''}`,
          value: rupees(num(c.annualValue)),
          terms:
            [
              c.responseTimeHours !== null
                ? `${c.responseTimeHours} h response`
                : null,
              c.pmVisitsPerYear !== null
                ? `${c.pmVisitsPerYear} PM a year`
                : null,
            ]
              .filter(Boolean)
              .join(', ') || null,
          status:
            STATUS[contractStatus(c, now)] +
            (c.terminationReason ? `: ${c.terminationReason}` : ''),
          file: yesNo(files.get(c.id) ?? 0),
        };
      }),
      notes: [],
    };
  }

  private fileCounts(
    field: 'calibrationRecordId' | 'safetyTestRecordId' | 'contractId',
    ids: string[],
  ) {
    return documentCounts(this.prisma, field, ids);
  }
}
