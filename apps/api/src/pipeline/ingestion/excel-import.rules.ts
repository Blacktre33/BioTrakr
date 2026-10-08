/**
 * Pure rules for the Excel asset import: which columns exist, how cell
 * values map to database values, and what makes a row valid. No database
 * access here, so every rule is unit-testable.
 */
import {
  AssetStatus,
  CriticalityLevel,
  DeviceCategory,
  RiskClassification,
} from '@prisma/client';
import * as XLSX from 'xlsx';

import { ASSET_FORM_ENUMS } from '../../reference/asset-form-options';

export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
export const DEFAULT_USEFUL_LIFE_YEARS = 10;

/** Example tags shipped in old and current templates; never imported. */
const EXAMPLE_TAGS = new Set(['ASSET-001', 'BT-2025-001', 'EXAMPLE-001']);

export type ColumnKey =
  | 'assetTag'
  | 'equipmentName'
  | 'manufacturer'
  | 'modelNumber'
  | 'serialNumber'
  | 'category'
  | 'criticality'
  | 'riskClass'
  | 'status'
  | 'facilityCode'
  | 'departmentCode'
  | 'purchaseDate'
  | 'purchasePrice'
  | 'usefulLifeYears'
  | 'installationDate'
  | 'warrantyExpiry'
  | 'udi'
  | 'rtlsTagId'
  | 'bleBeaconId'
  | 'notes';

interface ColumnSpec {
  key: ColumnKey;
  header: string;
  required?: boolean;
  aliases?: string[];
  help: string;
}

/** The template's columns, in order. Aliases accept older templates and common wording. */
export const IMPORT_COLUMNS: ColumnSpec[] = [
  {
    key: 'assetTag',
    header: 'Asset Tag',
    required: true,
    aliases: ['Tag', 'Asset Tag Number'],
    help: 'Exactly as printed on the device label',
  },
  {
    key: 'equipmentName',
    header: 'Equipment Name',
    required: true,
    aliases: ['Asset Type', 'Equipment Type', 'Type', 'Device Name', 'Name'],
    help: 'e.g. ICU ventilator',
  },
  {
    key: 'manufacturer',
    header: 'Manufacturer',
    required: true,
    aliases: ['Make'],
    help: 'e.g. GE Healthcare',
  },
  {
    key: 'modelNumber',
    header: 'Model Number',
    required: true,
    aliases: ['Model'],
    help: 'e.g. Optima MR360',
  },
  {
    key: 'serialNumber',
    header: 'Serial Number',
    aliases: ['Serial', 'Serial No', 'SN', 'S N'],
    help: "From the manufacturer's plate",
  },
  {
    key: 'category',
    header: 'Category',
    required: true,
    aliases: ['Asset Category', 'Device Category', 'Equipment Category'],
    help: 'One of the values on the Allowed Values sheet',
  },
  {
    key: 'criticality',
    header: 'Criticality',
    required: true,
    aliases: ['Criticality Level'],
    help: 'Critical, High, Medium or Low',
  },
  {
    key: 'riskClass',
    header: 'Risk Class',
    required: true,
    aliases: ['Risk Classification', 'Device Class'],
    help: 'Class I, Class II or Class III',
  },
  {
    key: 'status',
    header: 'Status',
    required: true,
    aliases: ['Asset Status'],
    help: 'One of the values on the Allowed Values sheet',
  },
  {
    key: 'facilityCode',
    header: 'Facility Code',
    required: true,
    aliases: ['Facility', 'Site Code', 'Site'],
    help: 'Code of a facility already set up in BioTrakr',
  },
  {
    key: 'departmentCode',
    header: 'Department Code',
    required: true,
    aliases: ['Department', 'Dept Code', 'Dept'],
    help: 'Code of a department in that facility',
  },
  {
    key: 'purchaseDate',
    header: 'Purchase Date',
    required: true,
    aliases: ['Acquisition Date', 'PO or Acquisition Date', 'Acquired Date'],
    help: 'YYYY-MM-DD, or an Excel date',
  },
  {
    key: 'purchasePrice',
    header: 'Purchase Price',
    aliases: ['Purchase Cost', 'Cost', 'Price'],
    help: 'In rupees; "1.25 lakh" also works. Leave blank if unknown',
  },
  {
    key: 'usefulLifeYears',
    header: 'Useful Life (Years)',
    aliases: ['Useful Life'],
    help: `Whole years; ${DEFAULT_USEFUL_LIFE_YEARS} if blank`,
  },
  {
    key: 'installationDate',
    header: 'Installation Date',
    help: 'YYYY-MM-DD, or an Excel date',
  },
  {
    key: 'warrantyExpiry',
    header: 'Warranty Expiry',
    aliases: ['Warranty End Date', 'Warranty End'],
    help: 'YYYY-MM-DD, or an Excel date',
  },
  {
    key: 'udi',
    header: 'UDI',
    aliases: ['UDI Device Identifier'],
    help: 'Unique Device Identifier',
  },
  {
    key: 'rtlsTagId',
    header: 'RTLS Tag ID',
    aliases: ['RFID Tag ID'],
    help: 'RFID tag on the device',
  },
  {
    key: 'bleBeaconId',
    header: 'BLE Beacon ID',
    help: 'Bluetooth beacon MAC address',
  },
  { key: 'notes', header: 'Notes', help: 'Anything else worth knowing' },
];

/** "Asset Tag*", "asset_tag" and "ASSET TAG" all become "asset tag". */
export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const HEADER_TO_KEY = new Map<string, ColumnKey>();
for (const col of IMPORT_COLUMNS) {
  for (const name of [col.header, ...(col.aliases ?? [])]) {
    HEADER_TO_KEY.set(normalizeHeader(name), col.key);
  }
}

/** Maps the sheet's header row to column keys; reports unknown and missing columns. */
export function mapHeaders(headers: string[]): {
  columns: Map<string, ColumnKey>;
  missing: ColumnSpec[];
  ignored: string[];
} {
  const columns = new Map<string, ColumnKey>();
  const ignored: string[] = [];
  for (const header of headers) {
    const key = HEADER_TO_KEY.get(normalizeHeader(header));
    if (key && ![...columns.values()].includes(key)) columns.set(header, key);
    else if (!key && header.trim() && !header.startsWith('__EMPTY'))
      ignored.push(header);
  }
  const present = new Set(columns.values());
  const missing = IMPORT_COLUMNS.filter(
    (c) => c.required && !present.has(c.key),
  );
  return { columns, missing, ignored };
}

// --------------------------------------------------------------------------
// Value mapping. Each accepts the database value, its label, or a common
// synonym, ignoring case, spaces and punctuation. Anything else is an error:
// a wrong guess here would put a wrong risk class or status on a device.
// --------------------------------------------------------------------------

function enumMatcher<T extends string>(
  values: Record<string, T>,
  labels: Array<{ value: string; label: string }>,
  synonyms: Record<string, T>,
) {
  const lookup = new Map<string, T>();
  for (const v of Object.values(values)) lookup.set(squash(v), v);
  for (const { value, label } of labels) lookup.set(squash(label), value as T);
  for (const [word, v] of Object.entries(synonyms)) lookup.set(squash(word), v);
  return (raw: string): T | null => lookup.get(squash(raw)) ?? null;
}

export const matchCategory = enumMatcher(
  DeviceCategory,
  ASSET_FORM_ENUMS.deviceCategory,
  {
    'diagnostic imaging': 'IMAGING',
    radiology: 'IMAGING',
    monitoring: 'PATIENT_MONITORING',
    lab: 'LABORATORY',
    therapy: 'THERAPEUTIC',
    anaesthesia: 'ANESTHESIA',
    sterilisation: 'STERILIZATION',
    support: 'SUPPORT_EQUIPMENT',
  },
);

export const matchStatus = enumMatcher(
  AssetStatus,
  ASSET_FORM_ENUMS.assetStatus,
  {
    available: 'ACTIVE',
    'in use': 'IN_SERVICE',
    maintenance: 'IN_MAINTENANCE',
    repair: 'IN_MAINTENANCE',
    'under repair': 'IN_MAINTENANCE',
    quarantine: 'QUARANTINED',
    decommissioned: 'RETIRED',
  },
);

export const matchCriticality = enumMatcher(
  CriticalityLevel,
  ASSET_FORM_ENUMS.criticalityLevel,
  {},
);

export const matchRiskClass = enumMatcher(
  RiskClassification,
  ASSET_FORM_ENUMS.riskClassification,
  {
    i: 'CLASS_I',
    '1': 'CLASS_I',
    'class 1': 'CLASS_I',
    ii: 'CLASS_II',
    '2': 'CLASS_II',
    'class 2': 'CLASS_II',
    iii: 'CLASS_III',
    '3': 'CLASS_III',
    'class 3': 'CLASS_III',
  },
);

const allowed = (options: Array<{ label: string }>) =>
  options.map((o) => o.label).join(', ');

export const ALLOWED_VALUES = {
  category: allowed(ASSET_FORM_ENUMS.deviceCategory),
  status: allowed(ASSET_FORM_ENUMS.assetStatus),
  criticality: allowed(ASSET_FORM_ENUMS.criticalityLevel),
  riskClass: allowed(ASSET_FORM_ENUMS.riskClassification),
};

/** A date from an Excel date cell (serial number) or a YYYY-MM-DD string, as UTC midnight. */
export function parseDateCell(value: unknown): Date | null | 'invalid' {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    const parts = XLSX.SSF.parse_date_code(value);
    if (!parts || parts.y < 1900) return 'invalid';
    return new Date(Date.UTC(parts.y, parts.m - 1, parts.d));
  }
  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return 'invalid';
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  // Rejects impossible dates such as 2024-02-30.
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    ? date
    : 'invalid';
}

/** Rupee amounts: 125000, "₹1,25,000", "1.25 lakh", "2 crore". */
export function parsePrice(value: unknown): number | null | 'invalid' {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number')
    return value >= 0 && Number.isFinite(value) ? value : 'invalid';
  const text = String(value).toLowerCase().trim();
  const unit = text.match(/^([\d.]+)\s*(lakhs?|lacs?|crores?)$/);
  if (unit) {
    const n = Number(unit[1]);
    if (!Number.isFinite(n)) return 'invalid';
    return unit[2].startsWith('cr') ? n * 10_000_000 : n * 100_000;
  }
  const cleaned = text.replace(/[₹$,\s]|rs\.?|inr/g, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return 'invalid';
  return Number(cleaned);
}

// --------------------------------------------------------------------------
// Rows
// --------------------------------------------------------------------------

export interface ImportIssue {
  /** Row number as Excel shows it (1 = header). 0 = the file as a whole. */
  row: number;
  field: string;
  message: string;
  value?: unknown;
}

export interface ImportWarning {
  row: number;
  message: string;
}

export interface SheetRow {
  row: number;
  values: Partial<Record<ColumnKey, unknown>>;
}

/** Reference data the rows are checked against, all from the importer's organization. */
export interface ImportReference {
  facilities: Array<{ id: string; facilityCode: string; facilityName: string }>;
  departments: Array<{
    id: string;
    facilityId: string;
    departmentCode: string;
    departmentName: string;
  }>;
}

export interface AssetDraft {
  row: number;
  assetTagNumber: string;
  equipmentName: string;
  manufacturer: string;
  modelNumber: string;
  serialNumber: string;
  deviceCategory: DeviceCategory;
  criticalityLevel: CriticalityLevel;
  riskClassification: RiskClassification;
  assetStatus: AssetStatus;
  currentFacilityId: string;
  facilityName: string;
  custodianDepartmentId: string;
  departmentName: string;
  purchaseDate: Date;
  purchaseCost: number;
  usefulLifeYears: number;
  installationDate: Date | null;
  warrantyEndDate: Date | null;
  udiDeviceIdentifier: string | null;
  rfidTagId: string | null;
  bleBeaconMac: string | null;
  notes: string | null;
}

const text = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value).trim();
const header = (key: ColumnKey) =>
  IMPORT_COLUMNS.find((c) => c.key === key)!.header;

/** Reads the first suitable sheet into rows keyed by column, with Excel row numbers. */
export function readSheet(buffer: Buffer): {
  rows: SheetRow[];
  missing: ColumnSpec[];
  ignored: string[];
  sheetName: string;
} {
  // raw values: dates stay Excel serial numbers (parsed exactly by parseDateCell).
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: false,
    dense: true,
  });
  const preferred = ['Asset Entry', 'Assets', 'Quick Entry', 'Sheet1'];
  const sheetName =
    preferred.find((n) => workbook.SheetNames.includes(n)) ??
    workbook.SheetNames[0];
  if (!sheetName)
    return {
      rows: [],
      missing: IMPORT_COLUMNS.filter((c) => c.required),
      ignored: [],
      sheetName: '',
    };

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  });
  const headerRow = (matrix[0] ?? []).map((h) => text(h));
  const { columns, missing, ignored } = mapHeaders(headerRow);

  const rows: SheetRow[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const cells = matrix[i] ?? [];
    const values: Partial<Record<ColumnKey, unknown>> = {};
    headerRow.forEach((h, c) => {
      const key = columns.get(h);
      if (key)
        values[key] =
          typeof cells[c] === 'string' ? (cells[c] as string).trim() : cells[c];
    });
    if (
      Object.values(values).every(
        (v) => v === null || v === undefined || v === '',
      )
    )
      continue;
    rows.push({ row: i + 1, values });
  }
  return { rows, missing, ignored, sheetName };
}

/**
 * Checks one row and turns it into a draft asset. Never guesses: a value
 * that does not clearly match is reported so the person can fix the sheet.
 */
export function checkRow(
  { row, values }: SheetRow,
  reference: ImportReference,
  today: Date = new Date(),
): { draft?: AssetDraft; errors: ImportIssue[]; warnings: ImportWarning[] } {
  const errors: ImportIssue[] = [];
  const warnings: ImportWarning[] = [];
  const issue = (key: ColumnKey, message: string, value?: unknown) =>
    errors.push({
      row,
      field: header(key),
      message,
      ...(value !== undefined && value !== null && value !== ''
        ? { value }
        : {}),
    });

  for (const col of IMPORT_COLUMNS) {
    if (col.required && text(values[col.key]) === '')
      issue(col.key, 'Required');
  }

  const assetTagNumber = text(values.assetTag);
  if (assetTagNumber.length > 100)
    issue('assetTag', 'Too long (100 characters at most)', assetTagNumber);

  const enumField = <T>(
    key: ColumnKey,
    match: (raw: string) => T | null,
    allowedList: string,
  ): T | undefined => {
    const raw = text(values[key]);
    if (!raw) return undefined;
    const v = match(raw);
    if (v === null)
      issue(key, `Not a recognised value. Use one of: ${allowedList}`, raw);
    return v ?? undefined;
  };
  const deviceCategory = enumField(
    'category',
    matchCategory,
    ALLOWED_VALUES.category,
  );
  const assetStatus = enumField('status', matchStatus, ALLOWED_VALUES.status);
  const criticalityLevel = enumField(
    'criticality',
    matchCriticality,
    ALLOWED_VALUES.criticality,
  );
  const riskClassification = enumField(
    'riskClass',
    matchRiskClass,
    ALLOWED_VALUES.riskClass,
  );

  // Facility and department must already exist: creating them from a typo
  // would scatter devices across look-alike locations.
  const facilityRaw = text(values.facilityCode);
  const facility = facilityRaw
    ? reference.facilities.find(
        (f) =>
          squash(f.facilityCode) === squash(facilityRaw) ||
          f.facilityName.toLowerCase() === facilityRaw.toLowerCase(),
      )
    : undefined;
  if (facilityRaw && !facility) {
    const known = reference.facilities
      .slice(0, 10)
      .map((f) => f.facilityCode)
      .join(', ');
    issue(
      'facilityCode',
      `No facility with this code in your organization${known ? `. Known codes: ${known}` : ''}`,
      facilityRaw,
    );
  }

  const departmentRaw = text(values.departmentCode);
  const department =
    facility && departmentRaw
      ? reference.departments.find(
          (d) =>
            d.facilityId === facility.id &&
            (squash(d.departmentCode) === squash(departmentRaw) ||
              d.departmentName.toLowerCase() === departmentRaw.toLowerCase()),
        )
      : undefined;
  if (facility && departmentRaw && !department) {
    issue(
      'departmentCode',
      `No department with this code in ${facility.facilityName}`,
      departmentRaw,
    );
  }

  const dateField = (key: ColumnKey, mustBePast: boolean): Date | null => {
    const parsed = parseDateCell(values[key]);
    if (parsed === 'invalid') {
      issue(
        key,
        'Use YYYY-MM-DD (e.g. 2024-01-15) or an Excel date',
        values[key],
      );
      return null;
    }
    if (parsed && mustBePast && parsed.getTime() > today.getTime()) {
      issue(key, "Can't be in the future", values[key]);
    }
    return parsed;
  };
  const purchaseDate = dateField('purchaseDate', true);
  const installationDate = dateField('installationDate', true);
  const warrantyEndDate = dateField('warrantyExpiry', false);

  let purchaseCost = 0;
  const price = parsePrice(values.purchasePrice);
  if (price === 'invalid')
    issue('purchasePrice', 'Not a valid amount', values.purchasePrice);
  else if (price === null)
    warnings.push({ row, message: 'No purchase price; recorded as 0' });
  else purchaseCost = price;

  let usefulLifeYears = DEFAULT_USEFUL_LIFE_YEARS;
  if (text(values.usefulLifeYears) !== '') {
    const years = Number(values.usefulLifeYears);
    if (!Number.isInteger(years) || years < 1 || years > 50) {
      issue(
        'usefulLifeYears',
        'Whole number of years, 1 to 50',
        values.usefulLifeYears,
      );
    } else {
      usefulLifeYears = years;
    }
  }

  const serialNumber = text(values.serialNumber);
  if (!serialNumber) warnings.push({ row, message: 'No serial number' });

  if (errors.length > 0) return { errors, warnings };

  return {
    errors,
    warnings,
    draft: {
      row,
      assetTagNumber,
      equipmentName: text(values.equipmentName),
      manufacturer: text(values.manufacturer),
      modelNumber: text(values.modelNumber),
      serialNumber,
      deviceCategory: deviceCategory!,
      criticalityLevel: criticalityLevel!,
      riskClassification: riskClassification!,
      assetStatus: assetStatus!,
      currentFacilityId: facility!.id,
      facilityName: facility!.facilityName,
      custodianDepartmentId: department!.id,
      departmentName: department!.departmentName,
      purchaseDate: purchaseDate!,
      purchaseCost,
      usefulLifeYears,
      installationDate,
      warrantyEndDate,
      udiDeviceIdentifier: text(values.udi) || null,
      rfidTagId: text(values.rtlsTagId) || null,
      bleBeaconMac: text(values.bleBeaconId) || null,
      notes: text(values.notes) || null,
    },
  };
}

export const isExampleRow = (r: SheetRow) =>
  EXAMPLE_TAGS.has(text(r.values.assetTag).toUpperCase());
