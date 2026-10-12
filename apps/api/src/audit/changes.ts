import type { Prisma } from '@prisma/client';

import type { Change } from './audit';

type Tx = Prisma.TransactionClient;
type Values = Record<string, unknown>;

/** What each field is called on screen. Others: "warrantyEndDate" → "Warranty end date". */
const LABELS: Record<string, string> = {
  // Devices
  assetTagNumber: 'Asset tag',
  equipmentName: 'Name',
  manufacturer: 'Manufacturer',
  modelNumber: 'Model',
  serialNumber: 'Serial number',
  deviceCategory: 'Category',
  criticalityLevel: 'Criticality',
  riskClassification: 'Risk class',
  assetStatus: 'Status',
  currentFacilityId: 'Facility',
  currentBuildingId: 'Building',
  currentFloorId: 'Floor',
  currentRoomId: 'Room',
  custodianDepartmentId: 'Department',
  primaryCustodianId: 'Custodian',
  purchaseDate: 'Purchase date',
  purchaseCost: 'Purchase cost',
  usefulLifeYears: 'Useful life (years)',
  warrantyStartDate: 'Warranty starts',
  warrantyEndDate: 'Warranty ends',
  udiDeviceIdentifier: 'UDI',
  pmFrequencyDays: 'PM every (days)',
  lastPmDate: 'Last PM',
  nextPmDueDate: 'PM due',
  requiresCalibration: 'Needs calibration',
  calibrationFrequencyDays: 'Calibration every (days)',
  nextCalibrationDue: 'Calibration due',
  requiresSafetyTest: 'Needs electrical safety tests',
  safetyTestFrequencyDays: 'Safety test every (days)',
  nextSafetyInspectionDue: 'Safety test due',
  electricalClass: 'Electrical class',
  appliedPartType: 'Applied parts',
  notes: 'Notes',
  // Calibration and electrical safety records
  calibratedAt: 'Calibrated on',
  provider: 'Done by',
  providerName: 'Laboratory or vendor',
  labAccreditationNumber: 'NABL accreditation',
  certificateNumber: 'Certificate number',
  validUntil: 'Valid until',
  measurementUncertainty: 'Measurement uncertainty',
  referenceStandards: 'Reference equipment',
  result: 'Result',
  testedAt: 'Tested on',
  reason: 'Reason for test',
  analyzer: 'Analyser',
  leakageMethod: 'Leakage method',
  visualInspectionPassed: 'Visual inspection passed',
  functionalTestPassed: 'Functional test passed',
  earthResistanceOhm: 'Protective earth resistance (Ω)',
  insulationMainsMOhm: 'Insulation resistance, mains (MΩ)',
  insulationAppliedMOhm: 'Insulation resistance, applied parts (MΩ)',
  equipmentLeakageUa: 'Equipment leakage (µA)',
  appliedPartLeakageUa: 'Applied part leakage (µA)',
  passed: 'Passed',
  // Work orders
  workOrderStatus: 'Status',
  assignedTechnicianId: 'Assigned to',
  failureCategory: 'Cause',
  workPerformed: 'What was done',
  // Contracts and vendors
  vendorId: 'Vendor',
  contractType: 'Type',
  contractNumber: 'Contract number',
  startDate: 'Starts',
  endDate: 'Ends',
  annualValue: 'Cost per year',
  pmVisitsPerYear: 'PM visits a year',
  responseTimeHours: 'Response time (hours)',
  uptimeGuaranteePercent: 'Uptime guarantee (%)',
  devices: 'Devices covered',
  vendorName: 'Name',
  vendorType: 'Type',
  contactPerson: 'Contact person',
  phone: 'Phone',
  email: 'Email',
  address: 'Address',
  // People
  firstName: 'First name',
  lastName: 'Last name',
  role: 'Role',
  isActive: 'Can sign in',
  facilityId: 'Facility',
  departmentId: 'Department',
  // Places
  facilityName: 'Name',
  facilityCode: 'Code',
  departmentName: 'Name',
  departmentCode: 'Code',
  buildingName: 'Name',
  buildingCode: 'Code',
  floorName: 'Name',
  floorNumber: 'Floor number',
  roomName: 'Name',
  roomCode: 'Code',
};

/** Shown as words: IN_MAINTENANCE → "In maintenance". */
const ENUMS = new Set([
  'assetStatus',
  'deviceCategory',
  'criticalityLevel',
  'riskClassification',
  'electricalClass',
  'appliedPartType',
  'contractType',
  'vendorType',
  'role',
  'result',
  'provider',
  'leakageMethod',
  'reason',
  'workOrderStatus',
  'failureCategory',
]);
const MONEY = new Set(['purchaseCost', 'annualValue']);
/**
 * A person's own details. The history is hash-chained and cannot be edited,
 * so it records that these changed but not the values, which can then be
 * erased from the person's record if the law requires.
 */
const PERSONAL = new Set(['firstName', 'lastName', 'email', 'phone']);

/** Fields that point at another record, shown by its name. */
const REFERENCES: Record<
  string,
  'facility' | 'department' | 'building' | 'floor' | 'room' | 'user' | 'vendor'
> = {
  currentFacilityId: 'facility',
  facilityId: 'facility',
  custodianDepartmentId: 'department',
  departmentId: 'department',
  currentBuildingId: 'building',
  buildingId: 'building',
  currentFloorId: 'floor',
  floorId: 'floor',
  currentRoomId: 'room',
  roomId: 'room',
  primaryCustodianId: 'user',
  assignedTechnicianId: 'user',
  vendorId: 'vendor',
};

export const labelOf = (field: string) =>
  LABELS[field] ??
  field
    .replace(/Id$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());

/** IN_MAINTENANCE → "In maintenance"; CLASS_I → "Class I". */
export const words = (v: string) =>
  v
    .split('_')
    .map((w, i) =>
      /^(I{1,3}|IV|BF|CF|AMC|CMC|ICU|OT)$/.test(w)
        ? w
        : i === 0
          ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
          : w.toLowerCase(),
    )
    .join(' ');

/** "1 Apr 2026". */
const date = (d: Date) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);

const rupees = (n: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(n);

const isDateField = (field: string) =>
  /(Date|Due|At)$/.test(field) || field === 'startDate' || field === 'endDate';

/** A value as it reads on screen; null for nothing. */
export function shown(
  field: string,
  value: unknown,
  names?: Map<string, string>,
): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (REFERENCES[field] && typeof value === 'string') {
    return names?.get(value) ?? value;
  }
  if (
    value instanceof Date ||
    (isDateField(field) && typeof value === 'string')
  ) {
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : date(d);
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object' && 'toNumber' in (value as object)) {
    value = (value as Prisma.Decimal).toNumber();
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return MONEY.has(field) ? rupees(Number(value)) : String(value);
  }
  if (Array.isArray(value)) return value.join(', ') || null;
  const text = String(value).trim();
  if (!text) return null;
  if (ENUMS.has(field)) return words(text);
  return text.length > 500 ? `${text.slice(0, 499)}…` : text;
}

/** Names of the records these fields point at, looked up in one go per kind. */
async function referenceNames(
  tx: Tx,
  pairs: Array<[field: string, id: string]>,
): Promise<Map<string, string>> {
  const ids = (kind: string) => [
    ...new Set(
      pairs.filter(([f]) => REFERENCES[f] === kind).map(([, id]) => id),
    ),
  ];
  const names = new Map<string, string>();
  const put = (id: string, name: string | null | undefined) =>
    name && names.set(id, name);
  const want = (kind: string) => ids(kind).length > 0;

  if (want('facility')) {
    for (const r of await tx.facility.findMany({
      where: { id: { in: ids('facility') } },
      select: { id: true, facilityName: true },
    }))
      put(r.id, r.facilityName);
  }
  if (want('department')) {
    for (const r of await tx.department.findMany({
      where: { id: { in: ids('department') } },
      select: { id: true, departmentName: true },
    }))
      put(r.id, r.departmentName);
  }
  if (want('building')) {
    for (const r of await tx.building.findMany({
      where: { id: { in: ids('building') } },
      select: { id: true, buildingName: true },
    }))
      put(r.id, r.buildingName);
  }
  if (want('floor')) {
    for (const r of await tx.floor.findMany({
      where: { id: { in: ids('floor') } },
      select: { id: true, floorName: true, floorNumber: true },
    }))
      put(r.id, r.floorName ?? `Floor ${r.floorNumber}`);
  }
  if (want('room')) {
    for (const r of await tx.room.findMany({
      where: { id: { in: ids('room') } },
      select: { id: true, roomName: true, roomCode: true },
    }))
      put(r.id, `${r.roomName} (${r.roomCode})`);
  }
  if (want('user')) {
    for (const r of await tx.user.findMany({
      where: { id: { in: ids('user') } },
      select: { id: true, firstName: true, lastName: true },
    }))
      put(r.id, `${r.firstName} ${r.lastName}`.trim());
  }
  if (want('vendor')) {
    for (const r of await tx.vendor.findMany({
      where: { id: { in: ids('vendor') } },
      select: { id: true, vendorName: true },
    }))
      put(r.id, r.vendorName);
  }
  return names;
}

/**
 * The fields of `after` whose value differs from `before`, as they read on
 * screen: dates as dates, rupees as rupees, a room by its name. A field
 * whose value reads the same (the same day at another hour) is no change.
 */
export async function changesBetween(
  tx: Tx,
  before: Values,
  after: Values,
): Promise<Change[]> {
  const fields = Object.keys(after).filter((f) => after[f] !== undefined);
  const refs: Array<[string, string]> = [];
  for (const f of fields) {
    for (const v of [before[f], after[f]]) {
      if (REFERENCES[f] && typeof v === 'string' && v) refs.push([f, v]);
    }
  }
  // Compared by id first, so only changed references are looked up.
  const changed = fields.filter(
    (f) => shown(f, before[f]) !== shown(f, after[f]),
  );
  const names = await referenceNames(
    tx,
    refs.filter(([f]) => changed.includes(f)),
  );
  return changed.map((field) =>
    PERSONAL.has(field)
      ? { field, label: labelOf(field), from: null, to: null, hidden: true }
      : {
          field,
          label: labelOf(field),
          from: shown(field, before[field], names),
          to: shown(field, after[field], names),
        },
  );
}

/** "Room, Department and Notes". */
export function listed(changes: Change[]): string {
  const labels = changes.map((c) => c.label);
  return labels.length <= 1
    ? (labels[0] ?? '')
    : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
}
