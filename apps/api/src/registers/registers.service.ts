import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AssetStatus, Prisma } from '@prisma/client';

import { describeLocation, LOCATION_SELECT } from '../assets/location';
import { DEFAULT_PM_INTERVAL_DAYS } from '../assets/pm-dates';
import type { Change } from '../audit/audit';
import { words } from '../audit/changes';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth-user';
import {
  bookValue,
  DISPOSAL_LABEL,
  reasonsText,
  repairShare,
  REVERSED,
  type CondemnationEvidence,
} from '../condemnation/condemnation';
import { contractStatus } from '../contracts/contract-status';
import { PrismaService } from '../database/prisma.service';
import { documentCounts } from '../documents/documents.service';
import { DEFAULT_CALIBRATION_INTERVAL_DAYS } from '../calibration/calibration';
import { breakdownClock, downtimeConfig } from '../downtime/downtime';
import {
  DowntimeService,
  hoursText,
  limitText,
} from '../downtime/downtime.service';
import {
  comingYear,
  everyText,
  MAX_PLAN_MONTHS,
  planCells,
  planMonths,
  type PlanSchedule,
} from './plan';
import { DEFAULT_SAFETY_TEST_INTERVAL_DAYS } from '../safety-tests/safety-test';
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

/** A PM checklist's result in a few words: "Pass", "Pass, 1 flagged: …", "Failed: …". */
function checklistResult(
  c: { outcome: string; items: Prisma.JsonValue } | null | undefined,
): string | null {
  if (!c) return null;
  const items = c.items as Array<{
    text: string;
    result: string;
    note: string | null;
  }>;
  const list = (result: string) =>
    items
      .filter((i) => i.result === result)
      .map((i) => (i.note ? `${i.text} (${i.note})` : i.text))
      .join('; ');
  if (c.outcome === 'FAIL') return `Failed: ${list('FAIL')}`;
  const flagged = items.filter((i) => i.result === 'FLAG').length;
  return flagged ? `Pass, ${flagged} flagged: ${list('FLAG')}` : 'Pass';
}

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

type Body = Pick<
  Register,
  'title' | 'basis' | 'columns' | 'notes' | 'details'
> & {
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly downtime: DowntimeService,
  ) {}

  async build(
    kind: RegisterKind,
    query: RegisterQuery,
    user: AuthUser,
  ): Promise<Register> {
    // A plan looks ahead: the year from the start of this month.
    const ahead =
      kind === 'planner' && !query.from && !query.to
        ? comingYear(new Date())
        : null;
    const to = ahead?.to ?? (query.to ? localDay(query.to) : new Date());
    const from =
      ahead?.from ??
      (query.from
        ? localDay(query.from)
        : new Date(to.getTime() - DEFAULT_PERIOD_DAYS * DAY));
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
      ...(body.details ? { details: body.details } : {}),
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
      case 'history':
        if (!q.assetId) {
          throw new BadRequestException(
            'Choose the device for its history card',
          );
        }
        return this.history(s, q.assetId);
      case 'planner':
        return this.planner(s);
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
      case 'uptime':
        return this.uptime(s);
      case 'condemnation':
        return this.condemnation(s);
      case 'audit':
        return this.auditTrail(s);
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
          pmChecklist: { select: { outcome: true, items: true } },
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
        const pm = checklistResult(o.pmChecklist);
        const result = cal
          ? `, ${cal.result.toLowerCase()}`
          : test
            ? `, ${test.passed ? 'passed' : 'failed'}`
            : pm
              ? `, ${pm.split(':')[0].toLowerCase()}`
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
                pm && pm !== 'Pass' ? pm : null,
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

  /**
   * A device's whole life on one card: purchase, installation, contracts,
   * maintenance, checks, breakdowns, changes of status made by hand, and
   * condemnation, oldest first, under its particulars.
   */
  private async history(s: Scope, assetId: string): Promise<Body> {
    const now = new Date();
    const a = await this.prisma.asset.findFirst({
      where: { id: assetId, ...this.devices(s) },
      select: {
        assetTagNumber: true,
        equipmentName: true,
        manufacturer: true,
        modelNumber: true,
        serialNumber: true,
        deviceCategory: true,
        criticalityLevel: true,
        assetStatus: true,
        purchaseOrderNumber: true,
        purchaseDate: true,
        purchaseCost: true,
        salvageValue: true,
        usefulLifeYears: true,
        installationDate: true,
        warrantyEndDate: true,
        pmFrequencyDays: true,
        nextPmDueDate: true,
        requiresCalibration: true,
        calibrationFrequencyDays: true,
        requiresSafetyTest: true,
        safetyTestFrequencyDays: true,
        vendor: { select: { vendorName: true } },
        ...LOCATION_SELECT,
        serviceContracts: {
          select: {
            contract: {
              select: {
                contractType: true,
                contractNumber: true,
                startDate: true,
                endDate: true,
                annualValue: true,
                terminatedAt: true,
                terminationReason: true,
                vendor: { select: { vendorName: true } },
              },
            },
          },
        },
      },
    });
    if (!a) throw new NotFoundException('Device not found');
    const person = { select: { firstName: true, lastName: true } };
    const [orders, calibrations, tests, changes, condemnations] =
      await Promise.all([
        this.prisma.maintenanceHistory.findMany({
          where: { assetId, workOrderStatus: { not: 'CANCELLED' } },
          orderBy: { createdAt: 'asc' },
          take: MAX_ROWS + 1,
          select: {
            workOrderType: true,
            workOrderStatus: true,
            isEmergency: true,
            createdAt: true,
            completedAt: true,
            description: true,
            workPerformed: true,
            failureCategory: true,
            assignedTechnician: person,
            calibrationRecords: {
              where: { supersededBy: null },
              select: { result: true, certificateNumber: true },
            },
            safetyTestRecords: {
              where: { supersededBy: null },
              select: { passed: true },
            },
            pmChecklist: { select: { outcome: true, items: true } },
          },
        }),
        this.prisma.calibrationRecord.findMany({
          where: { assetId, workOrderId: null, supersededBy: null },
          select: {
            calibratedAt: true,
            result: true,
            provider: true,
            providerName: true,
            certificateNumber: true,
            recordedBy: person,
          },
        }),
        this.prisma.safetyTestRecord.findMany({
          where: { assetId, workOrderId: null, supersededBy: null },
          select: { testedAt: true, passed: true, recordedBy: person },
        }),
        // Made by hand or by the device; the rest go with a work order or
        // a condemnation, which have their own lines.
        this.prisma.assetStatusChange.findMany({
          where: {
            assetId,
            source: { in: ['MANUAL', 'DEVICE_ALERT'] },
            toStatus: { notIn: ['CONDEMNED', 'DISPOSED'] },
            NOT: { reason: { startsWith: REVERSED } },
          },
          orderBy: { changedAt: 'asc' },
          select: {
            changedAt: true,
            fromStatus: true,
            toStatus: true,
            reason: true,
            source: true,
            changedBy: person,
          },
        }),
        this.prisma.condemnation.findMany({
          where: { assetId },
          orderBy: { proposedAt: 'asc' },
          select: {
            status: true,
            reasons: true,
            justification: true,
            repairEstimate: true,
            proposedAt: true,
            proposedBy: person,
            decidedAt: true,
            decidedBy: person,
            committee: true,
            decisionNote: true,
            withdrawnAt: true,
            withdrawnBy: person,
            withdrawalReason: true,
            disposedAt: true,
            disposedBy: person,
            disposalMethod: true,
            disposalNote: true,
            clearance: true,
          },
        }),
      ]);

    const KIND: Record<string, string> = {
      PREVENTIVE_MAINTENANCE: 'Preventive maintenance',
      CALIBRATION: 'Calibration',
      ELECTRICAL_SAFETY_TEST: 'Electrical safety test',
      INSPECTION: 'Inspection',
      INSTALLATION: 'Installation',
      DECOMMISSIONING: 'Decommissioning',
    };
    const lines: Array<{ at: Date; row: RegisterRow }> = [];
    const line = (
      at: Date,
      event: string,
      details: string | null,
      by: string | null = null,
      downtime: string | null = null,
    ) =>
      lines.push({ at, row: { date: day(at), event, details, by, downtime } });
    const join = (...parts: Array<string | null | undefined | false>) =>
      parts.filter(Boolean).join('; ') || null;
    const cost = num(a.purchaseCost);

    line(
      a.purchaseDate,
      'Purchased',
      join(
        rupees(cost),
        a.vendor && `from ${a.vendor.vendorName}`,
        a.purchaseOrderNumber && `PO ${a.purchaseOrderNumber}`,
      ),
    );
    if (a.installationDate) line(a.installationDate, 'Installed', null);
    for (const { contract: c } of a.serviceContracts) {
      line(
        c.startDate,
        `${c.contractType} contract`,
        join(
          `${c.vendor.vendorName}, ${day(c.startDate)} to ${day(c.endDate)}`,
          c.contractNumber && `no. ${c.contractNumber}`,
          c.annualValue !== null && `${rupees(num(c.annualValue))} a year`,
          c.terminatedAt &&
            `ended early ${day(c.terminatedAt)}: ${c.terminationReason}`,
        ),
      );
    }
    for (const o of orders) {
      const by = name(o.assignedTechnician);
      if ((BREAKDOWNS as readonly string[]).includes(o.workOrderType)) {
        line(
          o.createdAt,
          o.isEmergency ? 'Breakdown (urgent)' : 'Breakdown',
          join(
            o.description,
            o.failureCategory && `cause: ${words(o.failureCategory)}`,
            o.completedAt
              ? `rectified ${dayTime(o.completedAt)}${o.workPerformed ? `: ${o.workPerformed}` : ''}`
              : 'not yet rectified',
          ),
          by,
          o.completedAt
            ? duration(o.createdAt, o.completedAt)
            : `${duration(o.createdAt, now)} so far`,
        );
        continue;
      }
      const [cal] = o.calibrationRecords;
      const [test] = o.safetyTestRecords;
      const kind = KIND[o.workOrderType] ?? words(o.workOrderType);
      line(
        o.completedAt ?? o.createdAt,
        o.completedAt ? kind : `${kind} (open)`,
        join(
          o.completedAt ? o.workPerformed : o.description,
          cal &&
            `${cal.result.toLowerCase()}${cal.certificateNumber ? `, certificate ${cal.certificateNumber}` : ''}`,
          test && (test.passed ? 'passed' : 'failed'),
          checklistResult(o.pmChecklist),
        ),
        by,
      );
    }
    for (const c of calibrations) {
      line(
        c.calibratedAt,
        'Calibration',
        join(
          c.result.toLowerCase(),
          c.providerName ?? PROVIDER_LABEL[c.provider],
          c.certificateNumber && `certificate ${c.certificateNumber}`,
        ),
        name(c.recordedBy),
      );
    }
    for (const t of tests) {
      line(
        t.testedAt,
        'Electrical safety test',
        t.passed ? 'passed' : 'failed',
        name(t.recordedBy),
      );
    }
    for (const c of changes) {
      line(
        c.changedAt,
        'Status changed',
        `${STATUS_LABEL[c.fromStatus]} → ${STATUS_LABEL[c.toStatus]}: ${c.reason}`,
        name(c.changedBy) ??
          (c.source === 'DEVICE_ALERT' ? 'Device alert' : null),
      );
    }
    for (const c of condemnations) {
      line(
        c.proposedAt,
        'Proposed for condemnation',
        join(
          reasonsText(c.reasons),
          c.justification,
          c.repairEstimate !== null &&
            `repair estimate ${rupees(num(c.repairEstimate))}`,
        ),
        name(c.proposedBy),
      );
      if (c.decidedAt) {
        line(
          c.decidedAt,
          c.status === 'REJECTED'
            ? 'Condemnation not approved'
            : 'Condemnation approved',
          join(c.committee, c.decisionNote),
          name(c.decidedBy),
        );
      }
      if (c.withdrawnAt) {
        line(
          c.withdrawnAt,
          c.decidedAt ? 'Condemnation reversed' : 'Condemnation withdrawn',
          c.withdrawalReason,
          name(c.withdrawnBy),
        );
      }
      if (c.disposedAt && c.disposalMethod) {
        line(
          c.disposedAt,
          'Disposed of',
          join(
            DISPOSAL_LABEL[c.disposalMethod],
            c.disposalNote,
            c.clearance && `clearance: ${c.clearance}`,
          ),
          name(c.disposedBy),
        );
      }
    }
    lines.sort((x, y) => x.at.getTime() - y.at.getTime());

    const cover = a.serviceContracts
      .map((sc) => sc.contract)
      .filter((c) => contractStatus(c, now) === 'active')
      .sort((x, y) => y.endDate.getTime() - x.endDate.getTime())[0];
    // The intervals the schedule works to (its defaults when none is set).
    const schedule = [
      (a.pmFrequencyDays || a.nextPmDueDate) &&
        `PM ${everyText(a.pmFrequencyDays ?? DEFAULT_PM_INTERVAL_DAYS)}`,
      a.requiresCalibration &&
        `calibration ${everyText(a.calibrationFrequencyDays ?? DEFAULT_CALIBRATION_INTERVAL_DAYS)}`,
      a.requiresSafetyTest &&
        `electrical safety test ${everyText(a.safetyTestFrequencyDays ?? DEFAULT_SAFETY_TEST_INTERVAL_DAYS)}`,
    ];
    return {
      title: 'Equipment History Card',
      basis: 'NABH FMS.5.b (a log for each device); NHSRC guidelines',
      device: deviceCell(a),
      details: [
        { label: 'Ref ID', value: a.assetTagNumber },
        { label: 'Equipment', value: a.equipmentName },
        {
          label: 'Make and model',
          value: `${a.manufacturer} ${a.modelNumber}`,
        },
        { label: 'Serial number', value: a.serialNumber || null },
        { label: 'Category', value: words(a.deviceCategory) },
        { label: 'Criticality', value: words(a.criticalityLevel) },
        { label: 'Location', value: describeLocation(a) },
        { label: 'Supplier', value: a.vendor?.vendorName ?? null },
        {
          label: 'Purchased',
          value: join(
            day(a.purchaseDate),
            rupees(cost),
            a.purchaseOrderNumber && `PO ${a.purchaseOrderNumber}`,
          ),
        },
        { label: 'Installed', value: day(a.installationDate) },
        { label: 'Warranty until', value: day(a.warrantyEndDate) },
        {
          label: 'Service contract',
          value: cover
            ? `${cover.contractType} with ${cover.vendor.vendorName} to ${day(cover.endDate)}`
            : 'None in force',
        },
        {
          label: 'Useful life',
          value: `${a.usefulLifeYears} years; book value today ${rupees(
            bookValue(
              {
                purchaseCost: cost ?? 0,
                salvageValue: num(a.salvageValue) ?? 0,
                usefulLifeYears: a.usefulLifeYears,
                purchaseDate: a.purchaseDate,
              },
              now,
            ),
          )} (straight line)`,
        },
        { label: 'Maintenance', value: join(...schedule) },
        { label: 'Status', value: STATUS_LABEL[a.assetStatus] },
      ],
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'event', label: 'Event' },
        { key: 'details', label: 'Details' },
        { key: 'by', label: 'By' },
        { key: 'downtime', label: 'Downtime', align: 'right' },
      ],
      rows: lines.map((l) => l.row),
      snapshot: true,
      notes: [
        'Everything on record for this device, oldest first. Changes of status that go with a work order or a condemnation are on their lines.',
      ],
    };
  }

  /**
   * NABH FMS.5.c, the documented maintenance plan: each device's PM,
   * calibration and electrical safety tests month by month, as planned
   * from its intervals and as done.
   */
  private async planner(s: Scope): Promise<Body> {
    const months = planMonths(s.from, s.to);
    if (months.length > MAX_PLAN_MONTHS) {
      throw new BadRequestException(
        'Choose a period of up to a year for the plan',
      );
    }
    const now = new Date();
    const inService: Prisma.AssetWhereInput = {
      ...this.devices(s),
      assetStatus: { notIn: ['CONDEMNED', 'RETIRED', 'DISPOSED'] },
    };
    const inPeriod = { gte: s.from, lte: s.to };
    const [assets, orders, calibrations, tests] = await Promise.all([
      this.prisma.asset.findMany({
        where: inService,
        orderBy: [{ assetTagNumber: 'asc' }],
        take: MAX_ROWS + 1,
        select: {
          id: true,
          assetTagNumber: true,
          equipmentName: true,
          ...LOCATION_SELECT,
          pmFrequencyDays: true,
          nextPmDueDate: true,
          requiresCalibration: true,
          calibrationFrequencyDays: true,
          nextCalibrationDue: true,
          requiresSafetyTest: true,
          safetyTestFrequencyDays: true,
          nextSafetyInspectionDue: true,
        },
      }),
      this.prisma.maintenanceHistory.findMany({
        where: {
          asset: inService,
          workOrderStatus: 'COMPLETED',
          workOrderType: {
            in: [
              'PREVENTIVE_MAINTENANCE',
              'CALIBRATION',
              'ELECTRICAL_SAFETY_TEST',
            ],
          },
          completedAt: inPeriod,
        },
        select: { assetId: true, workOrderType: true, completedAt: true },
      }),
      // Recorded without a work order (e.g. an outside laboratory's).
      this.prisma.calibrationRecord.findMany({
        where: {
          asset: inService,
          workOrderId: null,
          supersededBy: null,
          calibratedAt: inPeriod,
        },
        select: { assetId: true, calibratedAt: true },
      }),
      this.prisma.safetyTestRecord.findMany({
        where: {
          asset: inService,
          workOrderId: null,
          supersededBy: null,
          testedAt: inPeriod,
        },
        select: { assetId: true, testedAt: true },
      }),
    ]);
    const done = new Map<string, Date[]>();
    const add = (assetId: string, kind: string, at: Date | null) => {
      if (!at) return;
      const key = `${assetId}:${kind}`;
      done.set(key, [...(done.get(key) ?? []), at]);
    };
    for (const o of orders) add(o.assetId, o.workOrderType, o.completedAt);
    for (const c of calibrations) add(c.assetId, 'CALIBRATION', c.calibratedAt);
    for (const t of tests) add(t.assetId, 'ELECTRICAL_SAFETY_TEST', t.testedAt);

    let unscheduled = 0;
    const rows: RegisterRow[] = [];
    for (const a of assets) {
      const schedules: PlanSchedule[] = [
        {
          kind: 'PM',
          every: a.pmFrequencyDays ?? DEFAULT_PM_INTERVAL_DAYS,
          next: a.nextPmDueDate,
          done: done.get(`${a.id}:PREVENTIVE_MAINTENANCE`) ?? [],
        },
        {
          kind: 'Calibration',
          every:
            a.calibrationFrequencyDays ?? DEFAULT_CALIBRATION_INTERVAL_DAYS,
          next: a.requiresCalibration ? a.nextCalibrationDue : null,
          done: done.get(`${a.id}:CALIBRATION`) ?? [],
        },
        {
          kind: 'Safety test',
          every: a.safetyTestFrequencyDays ?? DEFAULT_SAFETY_TEST_INTERVAL_DAYS,
          next: a.requiresSafetyTest ? a.nextSafetyInspectionDue : null,
          done: done.get(`${a.id}:ELECTRICAL_SAFETY_TEST`) ?? [],
        },
      ];
      if (schedules.every((x) => !x.next && x.done.length === 0)) {
        unscheduled++;
        continue;
      }
      const label = {
        PM: 'PM',
        Calibration: 'calibration',
        'Safety test': 'safety test',
      };
      rows.push({
        device: deviceCell(a),
        location: describeLocation(a),
        schedule:
          schedules
            .filter((x) => x.next)
            .map((x) => `${label[x.kind]} ${everyText(x.every!)}`)
            .join('; ') || null,
        ...planCells(schedules, months, now),
      });
    }
    return {
      title: 'Annual Maintenance Plan',
      basis:
        'NABH FMS.5.c (documented maintenance plan, implemented); NHSRC guidelines (PM and calibration schedule)',
      columns: [
        { key: 'device', label: 'Equipment' },
        { key: 'location', label: 'Location' },
        { key: 'schedule', label: 'Schedule' },
        ...months.map((m) => ({ key: m.key, label: m.label })),
      ],
      rows,
      notes: [
        'PM 15: due on the 15th. PM done 12: done on the 12th. Overdue: past its due date and not done yet, shown in the current month.',
        'Cal: calibration. EST: electrical safety test (IS/IEC 62353). Later dates follow each device’s interval from its next due date; work done early or late moves them.',
        ...(unscheduled
          ? [
              `${unscheduled} ${unscheduled === 1 ? 'device' : 'devices'} in service ${unscheduled === 1 ? 'has' : 'have'} no PM, calibration or safety test due and ${unscheduled === 1 ? 'is' : 'are'} not listed.`,
            ]
          : []),
      ],
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
        pmChecklist: {
          select: {
            outcome: true,
            items: true,
            checklistName: true,
            testEquipment: true,
          },
        },
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
        { key: 'checklist', label: 'Checklist result' },
        { key: 'equipment', label: 'Test equipment' },
        { key: 'status', label: 'Status' },
      ],
      rows: orders.map((o) => ({
        device: deviceCell(o.asset),
        location: describeLocation(o.asset),
        due: day(o.dueDate ?? o.scheduledDate),
        done: day(o.completedAt),
        by: o.completedAt ? name(o.assignedTechnician) : null,
        remarks: o.workPerformed,
        checklist: o.pmChecklist
          ? `${checklistResult(o.pmChecklist)} (${o.pmChecklist.checklistName})`
          : null,
        equipment: o.pmChecklist?.testEquipment ?? null,
        status: status(o),
      })),
      notes: [
        'Checklist result: each item passed, flagged (needs attention, still usable) or failed (taken out of use and a repair opened).',
      ],
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
        workOrderType: true,
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
            criticalityLevel: true,
            deviceCategory: true,
            ...LOCATION_SELECT,
          },
        },
      },
    });
    const now = new Date();
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
        { key: 'limit', label: 'Repair limit', align: 'right' },
        { key: 'within', label: 'Within limit' },
        { key: 'cause', label: 'Cause' },
        { key: 'action', label: 'Action taken' },
        { key: 'status', label: 'Status' },
      ],
      rows: orders.map((o) => {
        const by = name(o.assignedTechnician);
        const clock = breakdownClock(o, o.asset, now);
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
          limit: clock ? limitText(clock.limitHours) : null,
          within: !clock
            ? null
            : clock.state === 'over'
              ? `No, over by ${hoursText(-clock.leftHours)}`
              : clock.open
                ? `Open, ${hoursText(clock.leftHours)} left`
                : 'Yes',
          cause: title(o.failureCategory),
          action: o.workPerformed,
          status: STATUS[o.workOrderStatus] ?? 'Open',
        };
      }),
      notes: [
        'Downtime runs from the report to the device being rectified.',
        `Repair limits (BMMP Model RFP): ${limitText(downtimeConfig().criticalHours)} for critical and life-saving equipment (critical or high criticality, or life support), ${limitText(downtimeConfig().otherHours)} for everything else.`,
      ],
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

  /**
   * The condemnation file (NABH FMS.5.f): every proposal proposed, decided,
   * withdrawn or disposed of in the period, with the device's record and
   * the committee's decision.
   */
  private async condemnation(s: Scope): Promise<Body> {
    const inPeriod = { gte: s.from, lte: s.to };
    const rows = await this.prisma.condemnation.findMany({
      where: {
        organizationId: s.organizationId,
        asset: this.devices(s),
        OR: [
          { proposedAt: inPeriod },
          { decidedAt: inPeriod },
          { withdrawnAt: inPeriod },
          { disposedAt: inPeriod },
        ],
      },
      orderBy: [{ proposedAt: 'asc' }, { id: 'asc' }],
      take: MAX_ROWS + 1,
      select: {
        id: true,
        status: true,
        reasons: true,
        repairEstimate: true,
        currentValue: true,
        evidence: true,
        proposedAt: true,
        proposedBy: { select: { firstName: true, lastName: true } },
        decidedAt: true,
        committee: true,
        decisionNote: true,
        withdrawnAt: true,
        withdrawnBy: { select: { firstName: true, lastName: true } },
        withdrawalReason: true,
        disposedAt: true,
        disposalMethod: true,
        disposalNote: true,
        clearance: true,
        asset: {
          select: {
            assetTagNumber: true,
            equipmentName: true,
            purchaseDate: true,
            ...LOCATION_SELECT,
          },
        },
      },
    });
    const files = await this.fileCounts(
      'condemnationId',
      rows.map((r) => r.id),
    );
    const decision = (r: (typeof rows)[number]) => {
      const decided = r.decidedAt
        ? `${r.status === 'REJECTED' ? 'Not approved' : 'Approved'} ${day(r.decidedAt)}, ${r.committee}${r.decisionNote ? `: ${r.decisionNote}` : ''}`
        : null;
      if (r.status === 'PROPOSED') return 'Waiting for the committee';
      if (r.status === 'WITHDRAWN') {
        const withdrawn = `Withdrawn ${day(r.withdrawnAt)} (${name(r.withdrawnBy)}): ${r.withdrawalReason}`;
        return decided ? `${decided}; ${withdrawn}` : withdrawn;
      }
      return decided;
    };
    return {
      title: 'Condemnation Register',
      basis:
        'NABH FMS.5.f; NHSRC guidelines (condemnation board, AERB and PC-PNDT clearances)',
      columns: [
        { key: 'device', label: 'Equipment' },
        { key: 'location', label: 'Location' },
        { key: 'purchased', label: 'Purchased (cost)' },
        { key: 'age', label: 'Age / useful life' },
        { key: 'reasons', label: 'Reasons' },
        { key: 'history', label: 'Breakdowns in the year before' },
        { key: 'repair', label: 'Repair estimate', align: 'right' },
        { key: 'value', label: 'Value', align: 'right' },
        { key: 'proposed', label: 'Proposed (by)' },
        { key: 'decision', label: "Committee's decision" },
        { key: 'disposal', label: 'Disposal' },
        { key: 'file', label: 'Papers on file' },
      ],
      rows: rows.map((r) => {
        const e = r.evidence as unknown as CondemnationEvidence;
        const repair = num(r.repairEstimate);
        const value = num(r.currentValue);
        const share = repairShare(repair, value ?? e.bookValue);
        return {
          device: deviceCell(r.asset),
          location: describeLocation(r.asset),
          purchased: `${day(r.asset.purchaseDate)} (${rupees(e.purchaseCost)})`,
          age: `${e.ageYears} / ${e.usefulLifeYears} years`,
          reasons: reasonsText(r.reasons),
          history: `${e.breakdowns}, ${hoursText(e.downtimeHours)} out of use`,
          repair:
            repair === null
              ? null
              : `${rupees(repair)}${share === null ? '' : ` (${share}% of value)`}`,
          value:
            value === null ? `${rupees(e.bookValue)} (book)` : rupees(value),
          proposed: `${day(r.proposedAt)} (${name(r.proposedBy)})`,
          decision: decision(r),
          disposal:
            r.status === 'DISPOSED' && r.disposalMethod
              ? `${DISPOSAL_LABEL[r.disposalMethod]}, ${day(r.disposedAt)}: ${r.disposalNote}${r.clearance ? `. Clearance: ${r.clearance}` : ''}`
              : null,
          file: yesNo(files.get(r.id) ?? 0),
        };
      }),
      notes: [
        'A device is condemned only once the committee approves it; an administrator who did not propose it records the decision.',
        'Value: what the proposer gave, or the straight-line book value on the day it was proposed (book).',
        "An X-ray or other radiation unit leaves only with AERB's decommissioning approval, and an ultrasound machine is sold or transferred only with a PC-PNDT NOC.",
      ],
    };
  }

  /**
   * NABH FMS.5 and the NHSRC guidelines: how much of the period each
   * device was in use, with its breakdowns; worst first.
   */
  private async uptime(s: Scope): Promise<Body> {
    const result = await this.downtime.uptime(
      { organizationId: s.organizationId, facilityId: s.facilityId },
      s.from,
      s.to,
    );
    const t = result.totals;
    const pct = (n: number | null) => (n === null ? null : `${n}%`);
    const rows = [...result.devices]
      .filter((d) => d.serviceHours > 0)
      .sort(
        (a, b) =>
          (a.uptimePercent ?? 100) - (b.uptimePercent ?? 100) ||
          a.assetTagNumber.localeCompare(b.assetTagNumber),
      );
    return {
      title: 'Equipment Uptime Register',
      basis:
        'NABH FMS.5 (downtime from report to correction); NHSRC uptime targets: 95% district hospital, 90% CHC, 80% PHC',
      columns: [
        { key: 'device', label: 'Equipment' },
        { key: 'department', label: 'Department' },
        { key: 'limit', label: 'Repair limit' },
        { key: 'service', label: 'Hours in service', align: 'right' },
        { key: 'down', label: 'Hours out of use', align: 'right' },
        { key: 'uptime', label: 'Uptime', align: 'right' },
        { key: 'breakdowns', label: 'Breakdowns', align: 'right' },
        { key: 'longest', label: 'Longest breakdown', align: 'right' },
        { key: 'over', label: 'Over the limit', align: 'right' },
      ],
      rows: rows.map((d) => ({
        device: deviceCell(d),
        department: d.department,
        limit: limitText(d.limitHours),
        service: Math.round(d.serviceHours),
        down: d.downHours,
        uptime: pct(d.uptimePercent),
        breakdowns: d.breakdowns,
        longest: d.longestHours === null ? null : hoursText(d.longestHours),
        over: d.overLimit,
      })),
      notes: [
        `Overall uptime ${pct(t.uptimePercent) ?? 'not measurable'} against a target of ${t.targetPercent}%. Census today: ${pct(t.censusPercent) ?? '—'} of devices in service are working.`,
        `${t.breakdowns} breakdowns reported; ${t.overLimit} ran past their repair limit. Mean time to attend ${t.meanAttendHours === null ? '—' : hoursText(t.meanAttendHours)}, to repair ${t.mttrHours === null ? '—' : hoursText(t.mttrHours)}; mean time between failures ${t.mtbfHours === null ? '—' : hoursText(t.mtbfHours)}.`,
        `Repair limits (BMMP Model RFP): ${limitText(downtimeConfig().criticalHours)} for critical and life-saving equipment (critical or high criticality, or life support), ${limitText(downtimeConfig().otherHours)} for everything else.`,
        'Uptime: the share of time in service a device was not out of use (quarantined or under repair), from its status history. Time before it was registered, or after it was condemned or retired, is not counted. Worst first.',
      ],
    };
  }

  /**
   * The edit history for a period, oldest first, with the hash chain
   * checked: what NABH's "records cannot be altered" asks to be shown.
   */
  private async auditTrail(s: Scope): Promise<Body> {
    const [events, chain] = await Promise.all([
      this.prisma.auditEvent.findMany({
        where: {
          organizationId: s.organizationId,
          occurredAt: { gte: s.from, lte: s.to },
        },
        orderBy: { seq: 'asc' },
        take: MAX_ROWS + 1,
        select: {
          seq: true,
          occurredAt: true,
          actorRole: true,
          summary: true,
          changes: true,
          reason: true,
          actor: { select: { firstName: true, lastName: true } },
        },
      }),
      this.audit.check(s.organizationId),
    ]);
    const changed = (c: Change) =>
      c.hidden
        ? `${c.label} changed`
        : `${c.label}: ${c.from ?? '(blank)'} → ${c.to ?? '(blank)'}`;
    return {
      title: 'Edit History (Audit Trail)',
      basis:
        'NABH: records cannot be altered; every change is kept with who, when and why',
      columns: [
        { key: 'entry', label: 'Entry', align: 'right' },
        { key: 'at', label: 'Date and time' },
        { key: 'by', label: 'By' },
        { key: 'what', label: 'What happened' },
        { key: 'changes', label: 'What changed' },
        { key: 'reason', label: 'Reason or note' },
      ],
      rows: events.map((e) => ({
        entry: Number(e.seq),
        at: dayTime(e.occurredAt),
        by: e.actor
          ? `${name(e.actor)} (${e.actorRole})`
          : 'BioTrakr (automatic)',
        what: e.summary,
        changes:
          ((e.changes as unknown as Change[] | null) ?? [])
            .map(changed)
            .join('; ') || null,
        reason: e.reason,
      })),
      notes: [
        chain.brokenAt !== null
          ? `ALTERED: entry ${chain.brokenAt} and the entries after it no longer match their hashes. Something was changed or removed outside BioTrakr; restore from a backup.`
          : `Hash chain checked ${dayTime(chain.checkedAt)}: intact, ${chain.entries.toLocaleString('en-IN')} ${chain.entries === 1 ? 'entry' : 'entries'} in all.`,
        ...(chain.lastSeq !== null
          ? [
              `Latest entry ${chain.lastSeq}, SHA-256 ${chain.lastHash}. Keep this page: if entries were ever removed from the end, the chain would no longer reach this hash.`,
            ]
          : []),
        'Facility does not apply: the history covers the whole hospital. Personal details (names, phone, email) show only that they changed.',
      ],
    };
  }

  private fileCounts(
    field:
      | 'calibrationRecordId'
      | 'safetyTestRecordId'
      | 'contractId'
      | 'condemnationId',
    ids: string[],
  ) {
    return documentCounts(this.prisma, field, ids);
  }
}
