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
import ExcelJS from 'exceljs';

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

/** How codes are compared loosely ("C-G" = "cg"); also used to stop look-alike codes being created. */
export const codeKey = squash;

/**
 * The one record a spreadsheet value refers to: an exact code match wins;
 * otherwise a loose match (case, punctuation, or the name) must be unique.
 */
function pickByCode<T>(
  items: T[],
  raw: string,
  code: (item: T) => string,
  name: (item: T) => string,
): T | 'ambiguous' | undefined {
  const exact = items.filter((i) => code(i) === raw);
  if (exact.length === 1) return exact[0];
  const loose = items.filter(
    (i) =>
      squash(code(i)) === squash(raw) ||
      name(i).toLowerCase() === raw.toLowerCase(),
  );
  if (loose.length > 1) return 'ambiguous';
  return loose[0];
}

const HEADER_TO_KEY = new Map<string, ColumnKey>();
for (const col of IMPORT_COLUMNS) {
  for (const name of [col.header, ...(col.aliases ?? [])]) {
    HEADER_TO_KEY.set(normalizeHeader(name), col.key);
  }
}

/** Maps the sheet's header row to column keys; reports unknown and missing columns. */
export function mapHeaders(headers: string[]): {
  /** Column index -> key. */
  columns: Map<number, ColumnKey>;
  missing: ColumnSpec[];
  ignored: string[];
  /** Columns that appear more than once (by any of their names). */
  duplicates: string[];
} {
  const columns = new Map<number, ColumnKey>();
  const ignored: string[] = [];
  const duplicates: string[] = [];
  headers.forEach((header, index) => {
    const key = HEADER_TO_KEY.get(normalizeHeader(header));
    if (!key) {
      if (header.trim() && !header.startsWith('__EMPTY')) ignored.push(header);
      return;
    }
    // Two columns for the same field would make the result depend on
    // column order (e.g. "Status" twice), so that is an error.
    if ([...columns.values()].includes(key)) {
      duplicates.push(IMPORT_COLUMNS.find((c) => c.key === key)!.header);
      return;
    }
    columns.set(index, key);
  });
  const present = new Set(columns.values());
  const missing = IMPORT_COLUMNS.filter(
    (c) => c.required && !present.has(c.key),
  );
  return { columns, missing, ignored, duplicates };
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

/** Earliest plausible date; also catches a bare year (2024 = 1905-07-16 as a date). */
export const MIN_YEAR = 1950;

const DAY_MS = 24 * 60 * 60 * 1000;
/** Day 0 of Excel's two date systems (1900 counts from 1899-12-30 because of its leap-year bug). */
const EXCEL_EPOCH = {
  1900: Date.UTC(1899, 11, 30),
  1904: Date.UTC(1904, 0, 1),
};

/**
 * A date from an Excel date cell, an Excel day number, or a YYYY-MM-DD
 * string, as UTC midnight of that calendar day.
 */

export function parseDateCell(
  value: unknown,
  date1904 = false,
): Date | null | 'invalid' {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    // Date-formatted cells arrive as Dates (the reader applies the 1904
    // system itself). Keep the calendar day, ignoring any time of day; the
    // extra second absorbs float noise just under midnight.
    if (Number.isNaN(value.getTime())) return 'invalid';
    const day = new Date(
      Math.floor((value.getTime() + 1000) / DAY_MS) * DAY_MS,
    );
    return day.getUTCFullYear() < MIN_YEAR ? 'invalid' : day;
  }
  if (typeof value === 'number') {
    // A plain number in a date column: an Excel day number. Workbooks saved
    // by older Mac Excel count days from 1904, not 1900.
    if (!Number.isFinite(value) || value <= 0) return 'invalid';
    const day = new Date(
      EXCEL_EPOCH[date1904 ? 1904 : 1900] + Math.floor(value) * DAY_MS,
    );
    return day.getUTCFullYear() < MIN_YEAR ? 'invalid' : day;
  }
  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return 'invalid';
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (y < MIN_YEAR) return 'invalid';
  const date = new Date(Date.UTC(y, m - 1, d));
  // Rejects impossible dates such as 2024-02-30.
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    ? date
    : 'invalid';
}

/** purchase_cost is DECIMAL(12,2). */
export const MAX_PRICE = 9_999_999_999.99;

/** Rupee amounts: 125000, "₹1,25,000", "1.25 lakh", "2 crore". */
export function parsePrice(value: unknown): number | null | 'invalid' {
  const n = parseAmount(value);
  return typeof n === 'number' && n > MAX_PRICE ? 'invalid' : n;
}

function parseAmount(value: unknown): number | null | 'invalid' {
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
  /** The workbook counts dates from 1904 (older Mac Excel). */
  date1904?: boolean;
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
  /** Optional columns that had a value; blank ones are left alone on update. */
  provided: ColumnKey[];
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

/** Columns read as the text Excel shows, so "00123" keeps its leading zeros. */
const TEXT_COLUMNS = new Set<ColumnKey>([
  'assetTag',
  'equipmentName',
  'manufacturer',
  'modelNumber',
  'serialNumber',
  'facilityCode',
  'departmentCode',
  'udi',
  'rtlsTagId',
  'bleBeaconId',
  'notes',
]);

/**
 * A cell's value as a plain number, string, boolean or Date: formulas give
 * their result, rich text and hyperlinks their text.
 */
function plainValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date || typeof value !== 'object') return value;
  if ('richText' in value) return value.richText.map((r) => r.text).join('');
  if ('result' in value) return plainValue(value.result as ExcelJS.CellValue);
  if ('text' in value) return plainValue(value.text as ExcelJS.CellValue);
  if ('error' in value) return String(value.error);
  return null;
}

/**
 * The text Excel would show for identifier columns: a number formatted
 * "00000" (zero-padded tags) keeps its leading zeros.
 */
function shownText(cell: ExcelJS.Cell): unknown {
  const value = plainValue(cell.value);
  if (typeof value === 'number' && Number.isInteger(value)) {
    const fmt = cell.numFmt ?? '';
    return /^0+$/.test(fmt)
      ? String(value).padStart(fmt.length, '0')
      : String(value);
  }
  return value;
}

/** Columns read from the header row; real templates have about 20. */
export const MAX_COLUMNS = 200;
/** Limits on the unpacked file, checked before it is parsed (zip bombs). */
export const MAX_UNPACKED_BYTES = 60 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 1000;

/**
 * An .xlsx is a zip. Reads its central directory (without unpacking
 * anything) and refuses files that would unpack to something huge: a few
 * kilobytes can otherwise expand to gigabytes and stall the server.
 * Returns a reason to refuse, or null.
 */
export function unpackedSizeProblem(buffer: Buffer): string | null {
  const unreadable =
    'This file could not be read. Save it as .xlsx and try again.';
  // End-of-central-directory record: within the last 64 KB + 22 bytes.
  const start = Math.max(0, buffer.length - 65_557);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= start; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return unreadable;
  const entries = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  if (entries > MAX_ZIP_ENTRIES) return unreadable;

  let total = 0;
  for (let n = 0; n < entries; n++) {
    if (
      offset + 46 > buffer.length ||
      buffer.readUInt32LE(offset) !== 0x02014b50
    ) {
      return unreadable;
    }
    const size = buffer.readUInt32LE(offset + 24);
    // 0xFFFFFFFF means a ZIP64 size: far beyond any asset list.
    if (size === 0xffffffff) return 'This file is too large to import.';
    total += size;
    if (total > MAX_UNPACKED_BYTES) {
      return 'This file is too large to import. Split it into smaller files.';
    }
    offset +=
      46 +
      buffer.readUInt16LE(offset + 28) +
      buffer.readUInt16LE(offset + 30) +
      buffer.readUInt16LE(offset + 32);
  }
  return null;
}

/** Reads the first suitable sheet into rows keyed by column, with Excel row numbers. */
export async function readSheet(buffer: Buffer): Promise<{
  rows: SheetRow[];
  missing: ColumnSpec[];
  ignored: string[];
  duplicates: string[];
  sheetName: string;
  /** More data rows than one import allows; rows were not read. */
  tooManyRows?: number;
}> {
  const workbook = new ExcelJS.Workbook();
  // exceljs's typings predate today's generic Node Buffer type.
  await workbook.xlsx.load(
    buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );
  const date1904 = Boolean(workbook.properties?.date1904);
  const names = workbook.worksheets.map((w) => w.name);
  const preferred = ['Asset Entry', 'Assets', 'Quick Entry', 'Sheet1'];
  const sheetName = preferred.find((n) => names.includes(n)) ?? names[0];
  const sheet = sheetName ? workbook.getWorksheet(sheetName) : undefined;
  if (!sheet) {
    return {
      rows: [],
      missing: IMPORT_COLUMNS.filter((c) => c.required),
      ignored: [],
      duplicates: [],
      sheetName: '',
    };
  }

  // Header cells, by 1-based column number. Only the header row's own cells
  // count (a stray value far to the right must not widen every row), and
  // columnCount is computed once: it walks every row each time it is read.
  const headerRow = sheet.getRow(1);
  const width = Math.min(headerRow.cellCount, MAX_COLUMNS);
  const headers: string[] = [];
  for (let c = 1; c <= width; c++) {
    headers.push(text(plainValue(headerRow.getCell(c).value)));
  }
  const { columns, missing, ignored, duplicates } = mapHeaders(headers);

  const dataRows = sheet.actualRowCount - 1;
  if (dataRows > MAX_IMPORT_ROWS) {
    return {
      rows: [],
      missing,
      ignored,
      duplicates,
      sheetName,
      tooManyRows: dataRows,
    };
  }

  const rows: SheetRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const values: Partial<Record<ColumnKey, unknown>> = {};
    for (const [index, key] of columns) {
      const cell = row.getCell(index + 1);
      const value = TEXT_COLUMNS.has(key)
        ? shownText(cell)
        : plainValue(cell.value);
      values[key] = typeof value === 'string' ? value.trim() : value;
    }
    if (
      Object.values(values).every(
        (v) => v === null || v === undefined || v === '',
      )
    )
      return;
    rows.push({ row: rowNumber, values, date1904 });
  });
  return { rows, missing, ignored, duplicates, sheetName };
}

/**
 * Checks one row and turns it into a draft asset. Never guesses: a value
 * that does not clearly match is reported so the person can fix the sheet.
 */
export function checkRow(
  sheetRow: SheetRow,
  reference: ImportReference,
  today: Date = new Date(),
): { draft?: AssetDraft; errors: ImportIssue[]; warnings: ImportWarning[] } {
  const { row, values } = sheetRow;
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
  const facilityHit = facilityRaw
    ? pickByCode(
        reference.facilities,
        facilityRaw,
        (f) => f.facilityCode,
        (f) => f.facilityName,
      )
    : undefined;
  const facility = facilityHit === 'ambiguous' ? undefined : facilityHit;
  if (facilityHit === 'ambiguous') {
    issue(
      'facilityCode',
      'This matches more than one facility. Use the exact facility code.',
      facilityRaw,
    );
  } else if (facilityRaw && !facility) {
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
  const departmentHit =
    facility && departmentRaw
      ? pickByCode(
          reference.departments.filter((d) => d.facilityId === facility.id),
          departmentRaw,
          (d) => d.departmentCode,
          (d) => d.departmentName,
        )
      : undefined;
  const department = departmentHit === 'ambiguous' ? undefined : departmentHit;
  if (departmentHit === 'ambiguous') {
    issue(
      'departmentCode',
      `This matches more than one department in ${facility!.facilityName}. Use the exact department code.`,
      departmentRaw,
    );
  } else if (facility && departmentRaw && !department) {
    issue(
      'departmentCode',
      `No department with this code in ${facility.facilityName}`,
      departmentRaw,
    );
  }

  const dateField = (key: ColumnKey, mustBePast: boolean): Date | null => {
    const parsed = parseDateCell(values[key], sheetRow.date1904);
    if (parsed === 'invalid') {
      issue(
        key,
        'Use YYYY-MM-DD (e.g. 2024-01-15) or an Excel date, 1950 or later',
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
    issue(
      'purchasePrice',
      'Not a valid amount (0 to 9,99,99,99,999.99)',
      values.purchasePrice,
    );
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
      provided: IMPORT_COLUMNS.filter(
        (c) => !c.required && text(values[c.key]) !== '',
      ).map((c) => c.key),
    },
  };
}

export const isExampleRow = (r: SheetRow) =>
  EXAMPLE_TAGS.has(text(r.values.assetTag).toUpperCase());
