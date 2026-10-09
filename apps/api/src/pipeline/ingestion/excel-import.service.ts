import { Injectable, Logger } from '@nestjs/common';
import type { AssetStatus } from '@prisma/client';
import * as XLSX from 'xlsx';

import type { AuthUser } from '../../auth/auth-user';
import { PrismaService } from '../../database/prisma.service';
import { ASSET_FORM_ENUMS } from '../../reference/asset-form-options';
import {
  IMPORT_COLUMNS,
  MAX_IMPORT_ROWS,
  checkRow,
  isExampleRow,
  readSheet,
  type AssetDraft,
  type ColumnKey,
  type ImportIssue,
  type ImportReference,
  type ImportWarning,
} from './excel-import.rules';

export type { ImportIssue, ImportWarning } from './excel-import.rules';

/** How many rows the preview shows; the counts always cover the whole file. */
export const PREVIEW_ROWS = 50;

export interface ImportPreviewRow {
  row: number;
  action: 'create' | 'update';
  assetTagNumber: string;
  equipmentName: string;
  facility: string;
  department: string;
  status: string;
  category: string;
  /** For updates: the columns whose values will change. */
  changes?: string[];
}

/** Result of checking a file. Nothing is written. */
export interface ImportCheck {
  valid: boolean;
  totalRows: number;
  toCreate: number;
  toUpdate: number;
  errors: ImportIssue[];
  warnings: ImportWarning[];
  preview: ImportPreviewRow[];
}

/** Result of an import. All rows are saved, or none are. */
export interface ImportResult {
  success: boolean;
  totalRows: number;
  imported: number;
  created: number;
  updated: number;
  /** Rows with at least one error. */
  failed: number;
  errors: ImportIssue[];
  warnings: ImportWarning[];
}

type PlannedDraft = AssetDraft & {
  existingId?: string;
  /** The device is in a do-not-use status; an import never releases it. */
  keepStatus?: boolean;
  /** Status before the import, for the status history. */
  previousStatus?: AssetStatus;
};

interface Plan {
  check: ImportCheck;
  drafts: PlannedDraft[];
}

/** Statuses that mean "do not use" on /scan; see asset-lookup.service.ts. */
const STOP_STATUSES: ReadonlySet<string> = new Set([
  'QUARANTINED',
  'IN_MAINTENANCE',
  'CONDEMNED',
  'RETIRED',
  'DISPOSED',
]);

/** Database field -> the column it comes from. */
const FIELD_COLUMN: Record<keyof ReturnType<typeof assetFields>, ColumnKey> = {
  assetTagNumber: 'assetTag',
  equipmentName: 'equipmentName',
  manufacturer: 'manufacturer',
  modelNumber: 'modelNumber',
  serialNumber: 'serialNumber',
  deviceCategory: 'category',
  criticalityLevel: 'criticality',
  riskClassification: 'riskClass',
  assetStatus: 'status',
  currentFacilityId: 'facilityCode',
  custodianDepartmentId: 'departmentCode',
  purchaseDate: 'purchaseDate',
  purchaseCost: 'purchasePrice',
  usefulLifeYears: 'usefulLifeYears',
  installationDate: 'installationDate',
  warrantyEndDate: 'warrantyExpiry',
  udiDeviceIdentifier: 'udi',
  rfidTagId: 'rtlsTagId',
  bleBeaconMac: 'bleBeaconId',
  notes: 'notes',
};

type AssetFields = ReturnType<typeof assetFields>;

/**
 * What an import writes to an existing device: required columns always,
 * optional columns only when the cell has a value (a blank cell never wipes
 * data), and never a status that would release a do-not-use device.
 */
function updateFields(draft: PlannedDraft): Partial<AssetFields> {
  const all = assetFields(draft);
  const required = new Set(
    IMPORT_COLUMNS.filter((c) => c.required).map((c) => c.key),
  );
  const provided = new Set(draft.provided);
  const out: Partial<AssetFields> = {};
  for (const [field, column] of Object.entries(FIELD_COLUMN) as Array<
    [keyof AssetFields, ColumnKey]
  >) {
    if (field === 'assetStatus' && draft.keepStatus) continue;
    if (required.has(column) || provided.has(column)) {
      (out as Record<string, unknown>)[field] = all[field];
    }
  }
  return out;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    return (
      a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
    );
  }
  if (a === null || a === undefined || b === null || b === undefined) {
    return (a ?? null) === (b ?? null);
  }
  // Prisma returns DECIMAL columns as Decimal objects.
  if (typeof a === 'number' || typeof b === 'number')
    return Number(a) === Number(b);
  return String(a) === String(b);
}

/** The draft's database columns (drops row number and display names). */
function assetFields(draft: AssetDraft) {
  return {
    assetTagNumber: draft.assetTagNumber,
    equipmentName: draft.equipmentName,
    manufacturer: draft.manufacturer,
    modelNumber: draft.modelNumber,
    serialNumber: draft.serialNumber,
    deviceCategory: draft.deviceCategory,
    criticalityLevel: draft.criticalityLevel,
    riskClassification: draft.riskClassification,
    assetStatus: draft.assetStatus,
    currentFacilityId: draft.currentFacilityId,
    custodianDepartmentId: draft.custodianDepartmentId,
    purchaseDate: draft.purchaseDate,
    purchaseCost: draft.purchaseCost,
    usefulLifeYears: draft.usefulLifeYears,
    installationDate: draft.installationDate,
    warrantyEndDate: draft.warrantyEndDate,
    udiDeviceIdentifier: draft.udiDeviceIdentifier,
    rfidTagId: draft.rfidTagId,
    bleBeaconMac: draft.bleBeaconMac,
    notes: draft.notes,
  };
}

const labelOf = (
  options: Array<{ value: string; label: string }>,
  value: string,
) => options.find((o) => o.value === value)?.label ?? value;

@Injectable()
export class ExcelImportService {
  private readonly logger = new Logger(ExcelImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Checks a file and shows what would happen. Never writes. */
  async checkFile(fileBuffer: Buffer, user: AuthUser): Promise<ImportCheck> {
    return (await this.plan(fileBuffer, user)).check;
  }

  /**
   * Imports a file only if every row is valid, in one transaction: either
   * all devices are saved or none are, so a half-imported sheet never has
   * to be untangled.
   */
  async importFromExcel(
    fileBuffer: Buffer,
    user: AuthUser,
  ): Promise<ImportResult> {
    const { check, drafts } = await this.plan(fileBuffer, user);
    const base = {
      totalRows: check.totalRows,
      warnings: check.warnings,
    };
    if (!check.valid) {
      return {
        ...base,
        success: false,
        imported: 0,
        created: 0,
        updated: 0,
        failed: new Set(check.errors.filter((e) => e.row > 0).map((e) => e.row))
          .size,
        errors: check.errors,
      };
    }

    let failingRow = 0;
    try {
      await this.prisma.$transaction(
        async (tx) => {
          for (const draft of drafts) {
            failingRow = draft.row;
            const { existingId } = draft;
            if (existingId) {
              const fields = updateFields(draft);
              const statusChanges =
                fields.assetStatus !== undefined &&
                fields.assetStatus !== draft.previousStatus;
              const { count } = await tx.asset.updateMany({
                where: {
                  id: existingId,
                  organizationId: user.organizationId,
                  deletedAt: null,
                  // The status checked in the preview must still hold.
                  ...(draft.previousStatus
                    ? { assetStatus: draft.previousStatus }
                    : {}),
                },
                data: { ...fields, updatedById: user.userId },
              });
              if (count === 0) throw new Error('ASSET_CHANGED');
              if (statusChanges && draft.previousStatus) {
                await tx.assetStatusChange.create({
                  data: {
                    assetId: existingId,
                    fromStatus: draft.previousStatus,
                    toStatus: fields.assetStatus!,
                    reason: `Excel import, row ${draft.row}`,
                    source: 'IMPORT',
                    changedById: user.userId,
                  },
                });
              }
            } else {
              await tx.asset.create({
                data: {
                  ...assetFields(draft),
                  organizationId: user.organizationId,
                  primaryCustodianId: user.userId,
                  createdById: user.userId,
                  updatedById: user.userId,
                },
              });
            }
          }
        },
        { timeout: 120_000 },
      );
    } catch (error) {
      const code = (error as { code?: string }).code;
      const target = String(
        (error as { meta?: { target?: unknown } }).meta?.target ?? '',
      );
      const message =
        code === 'P2002'
          ? target.includes('assetTagNumber') || !target
            ? 'This asset tag was added by someone else while you were importing. Check the file again.'
            : `This row duplicates a value that must be unique (${target}).`
          : (error as Error).message === 'ASSET_CHANGED'
            ? 'This device was deleted or changed while you were importing. Check the file again.'
            : 'Could not save this row. Nothing was imported; please try again.';
      if (!code && (error as Error).message !== 'ASSET_CHANGED') {
        this.logger.error(
          `Import failed at row ${failingRow}`,
          (error as Error).stack,
        );
      }
      return {
        ...base,
        success: false,
        imported: 0,
        created: 0,
        updated: 0,
        failed: 1,
        errors: [{ row: failingRow, field: 'Asset Tag', message }],
      };
    }

    this.logger.log(
      `Imported ${drafts.length} assets for organization ${user.organizationId} (${check.toCreate} new, ${check.toUpdate} updated)`,
    );
    return {
      ...base,
      success: true,
      imported: drafts.length,
      created: check.toCreate,
      updated: check.toUpdate,
      failed: 0,
      errors: [],
    };
  }

  private async plan(fileBuffer: Buffer, user: AuthUser): Promise<Plan> {
    const errors: ImportIssue[] = [];
    const warnings: ImportWarning[] = [];
    const empty = (): Plan => ({
      check: {
        valid: false,
        totalRows: 0,
        toCreate: 0,
        toUpdate: 0,
        errors,
        warnings,
        preview: [],
      },
      drafts: [],
    });

    let sheet: ReturnType<typeof readSheet>;
    try {
      sheet = readSheet(fileBuffer);
    } catch {
      errors.push({
        row: 0,
        field: 'File',
        message: 'This file could not be read. Save it as .xlsx and try again.',
      });
      return empty();
    }

    if (sheet.missing.length > 0) {
      for (const col of sheet.missing) {
        errors.push({
          row: 0,
          field: col.header,
          message: `Column "${col.header}" is missing. Download the latest template and copy your rows into it.`,
        });
      }
      return empty();
    }
    if (sheet.duplicates.length > 0) {
      for (const header of sheet.duplicates) {
        errors.push({
          row: 0,
          field: header,
          message: `Column "${header}" appears more than once. Keep one and delete the others.`,
        });
      }
      return empty();
    }
    if (sheet.ignored.length > 0) {
      warnings.push({
        row: 0,
        message: `These columns are not used and will be ignored: ${sheet.ignored.join(', ')}`,
      });
    }

    const rows = sheet.rows.filter((r) => {
      if (!isExampleRow(r)) return true;
      warnings.push({
        row: r.row,
        message: 'Skipped the template example row',
      });
      return false;
    });
    if (rows.length === 0) {
      errors.push({
        row: 0,
        field: 'File',
        message: `No devices found in sheet "${sheet.sheetName}". Add one row per device under the header row.`,
      });
      return empty();
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      errors.push({
        row: 0,
        field: 'File',
        message: `This file has ${rows.length} rows; the limit is ${MAX_IMPORT_ROWS} per import. Split it into smaller files.`,
      });
      return {
        ...empty(),
        check: { ...empty().check, totalRows: rows.length },
      };
    }

    const reference = await this.loadReference(user.organizationId);
    const today = new Date();
    const drafts: Plan['drafts'] = [];
    const seenTags = new Map<string, number>();

    for (const sheetRow of rows) {
      const result = checkRow(sheetRow, reference, today);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
      if (!result.draft) continue;

      // Tags must be unique ignoring case, or scanning a label becomes ambiguous.
      const key = result.draft.assetTagNumber.toLowerCase();
      const firstRow = seenTags.get(key);
      if (firstRow) {
        errors.push({
          row: sheetRow.row,
          field: 'Asset Tag',
          message: `Same tag as row ${firstRow}`,
          value: result.draft.assetTagNumber,
        });
        continue;
      }
      seenTags.set(key, sheetRow.row);
      drafts.push(result.draft);
    }

    // Existing devices in this organization: live -> update; deleted -> tag reserved.
    const existing = await this.findExistingTags(
      drafts.map((d) => d.assetTagNumber),
      user.organizationId,
    );
    const changes = new Map<number, string[]>();
    for (const draft of drafts) {
      const matches = existing.get(draft.assetTagNumber.toLowerCase()) ?? [];
      if (matches.length === 0) continue;
      const live = matches.filter((m) => m.deletedAt === null);
      if (live.length > 1) {
        errors.push({
          row: draft.row,
          field: 'Asset Tag',
          message:
            'More than one device already has this tag (differing only in upper/lower case). Fix those devices first.',
          value: draft.assetTagNumber,
        });
        continue;
      }
      const match = live[0];
      if (!match) {
        // Only deleted devices have it: their tags stay reserved so their
        // history (scans, work orders) can't be mixed up with a new device.
        errors.push({
          row: draft.row,
          field: 'Asset Tag',
          message:
            'This tag belonged to a device that was deleted, and stays reserved. Use a new tag.',
          value: draft.assetTagNumber,
        });
        continue;
      }
      draft.existingId = match.id;
      draft.previousStatus = match.assetStatus as AssetStatus;
      // Keep the tag exactly as it is stored, so the label still scans.
      draft.assetTagNumber = match.assetTagNumber;
      if (
        STOP_STATUSES.has(match.assetStatus) &&
        !STOP_STATUSES.has(draft.assetStatus)
      ) {
        draft.keepStatus = true;
        warnings.push({
          row: draft.row,
          message: `Status stays ${labelOf(ASSET_FORM_ENUMS.assetStatus, match.assetStatus)}: an import can't release a device that is out of use. Biomedical engineering must release it on the device itself.`,
        });
      }
      const update = updateFields(draft);
      changes.set(
        draft.row,
        (Object.keys(update) as Array<keyof AssetFields>)
          .filter((f) => !sameValue(update[f], match[f]))
          .map(
            (f) =>
              IMPORT_COLUMNS.find((c) => c.key === FIELD_COLUMN[f])!.header,
          ),
      );
    }

    const valid = errors.length === 0;
    const toUpdate = drafts.filter((d) => d.existingId).length;
    return {
      drafts,
      check: {
        valid,
        totalRows: rows.length,
        toCreate: valid ? drafts.length - toUpdate : 0,
        toUpdate: valid ? toUpdate : 0,
        errors,
        warnings,
        preview: drafts.slice(0, PREVIEW_ROWS).map((d) => ({
          row: d.row,
          action: d.existingId ? 'update' : 'create',
          assetTagNumber: d.assetTagNumber,
          equipmentName: d.equipmentName,
          facility: d.facilityName,
          department: d.departmentName,
          status: labelOf(ASSET_FORM_ENUMS.assetStatus, d.assetStatus),
          category: labelOf(ASSET_FORM_ENUMS.deviceCategory, d.deviceCategory),
          ...(d.existingId ? { changes: changes.get(d.row) ?? [] } : {}),
        })),
      },
    };
  }

  private async loadReference(
    organizationId: string,
  ): Promise<ImportReference> {
    const [facilities, departments] = await Promise.all([
      this.prisma.facility.findMany({
        where: { organizationId, isActive: true },
        select: { id: true, facilityCode: true, facilityName: true },
        orderBy: { facilityCode: 'asc' },
      }),
      this.prisma.department.findMany({
        where: { facility: { organizationId, isActive: true } },
        select: {
          id: true,
          facilityId: true,
          departmentCode: true,
          departmentName: true,
        },
      }),
    ]);
    return { facilities, departments };
  }

  /** Existing assets with any of these tags (ignoring case), grouped by lower-case tag. */
  private async findExistingTags(tags: string[], organizationId: string) {
    const select = {
      id: true,
      organizationId: true,
      deletedAt: true,
      ...Object.fromEntries(Object.keys(FIELD_COLUMN).map((f) => [f, true])),
    } as const;
    const found = new Map<
      string,
      Array<
        AssetFields & {
          id: string;
          organizationId: string;
          deletedAt: Date | null;
        }
      >
    >();
    for (let i = 0; i < tags.length; i += 500) {
      const chunk = tags.slice(i, i + 500);
      if (chunk.length === 0) continue;
      const rows = (await this.prisma.asset.findMany({
        where: {
          organizationId,
          OR: chunk.map((tag) => ({
            assetTagNumber: { equals: tag, mode: 'insensitive' as const },
          })),
        },
        select,
      })) as unknown as Array<
        AssetFields & {
          id: string;
          organizationId: string;
          deletedAt: Date | null;
        }
      >;
      for (const r of rows) {
        const key = r.assetTagNumber.toLowerCase();
        found.set(key, [...(found.get(key) ?? []), r]);
      }
    }
    return found;
  }

  /**
   * Export assets to Excel format
   */
  async exportToExcel(
    organizationId: string,
    facilityId?: string,
  ): Promise<Buffer> {
    const whereClause = {
      organizationId,
      ...(facilityId ? { currentFacilityId: facilityId } : {}),
    };

    const assets = await this.prisma.asset.findMany({
      where: {
        ...whereClause,
        deletedAt: null,
      },
      include: {
        currentFacility: true,
      },
      orderBy: {
        assetTagNumber: 'asc',
      },
    });

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Transform data for Excel
    const excelData = assets.map((a) => ({
      'Asset Tag': a.assetTagNumber,
      'Serial Number': a.serialNumber,
      Manufacturer: a.manufacturer,
      'Model Number': a.modelNumber,
      Facility: a.currentFacility?.facilityName || '',
      Status: a.assetStatus,
      'Acquisition Date': a.purchaseDate,
      'Installation Date': a.installationDate,
      'Warranty Expiry': a.warrantyEndDate,
      'Purchase Price': a.purchaseCost,
      UDI: a.udiDeviceIdentifier,
      'RTLS Tracked': a.rfidTagId || a.bleBeaconMac ? 'Yes' : 'No',
      'RTLS Tag ID': a.rfidTagId,
      'BLE Beacon ID': a.bleBeaconMac,
      Notes: a.notes,
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);
    XLSX.utils.book_append_sheet(wb, ws, 'Assets');

    // Write to buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return buffer;
  }

  /**
   * Blank template: an entry sheet with only the header row (no example to
   * delete), an instructions sheet, and the allowed values for each list.
   */
  async generateTemplate(): Promise<Buffer> {
    const wb = XLSX.utils.book_new();

    const headers = IMPORT_COLUMNS.map((c) =>
      c.required ? `${c.header}*` : c.header,
    );
    const entry = XLSX.utils.aoa_to_sheet([headers]);
    entry['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 2, 16) }));
    XLSX.utils.book_append_sheet(wb, entry, 'Asset Entry');

    const instructions = [
      ['BioTrakr asset import'],
      [],
      [
        '1. Fill in one row per device on the "Asset Entry" sheet. Columns marked * are required.',
      ],
      [
        '2. Use the exact words from the "Allowed Values" sheet for Category, Status, Criticality and Risk Class.',
      ],
      [
        '3. Facility Code and Department Code must already exist in BioTrakr (Settings).',
      ],
      ['4. Dates: YYYY-MM-DD (e.g. 2024-01-15), or an Excel date.'],
      [
        '5. A row whose Asset Tag already exists in your organization updates that device.',
      ],
      [
        '6. Upload, then press "Check file". Nothing is saved until every row is valid and you press Import.',
      ],
      [],
      ['Column', 'Required', 'What to enter'],
      ...IMPORT_COLUMNS.map((c) => [c.header, c.required ? 'Yes' : '', c.help]),
      [],
      ['Example row'],
      [
        'ASSET-001 (this tag is never imported)',
        'ICU ventilator',
        'Philips',
        'V60',
        'SN123456',
        'Life Support',
        'Critical',
        'Class II',
        'Active',
        'CG',
        'ICU',
        '2024-01-15',
      ],
    ];
    const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
    wsInstructions['!cols'] = [{ wch: 28 }, { wch: 10 }, { wch: 70 }];
    XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions');

    const lists = [
      ['Category', 'Status', 'Criticality', 'Risk Class'],
      ...Array.from(
        {
          length: Math.max(
            ASSET_FORM_ENUMS.deviceCategory.length,
            ASSET_FORM_ENUMS.assetStatus.length,
          ),
        },
        (_, i) => [
          ASSET_FORM_ENUMS.deviceCategory[i]?.label ?? '',
          ASSET_FORM_ENUMS.assetStatus[i]?.label ?? '',
          ASSET_FORM_ENUMS.criticalityLevel[i]?.label ?? '',
          ASSET_FORM_ENUMS.riskClassification[i]?.label ?? '',
        ],
      ),
    ];
    const wsLists = XLSX.utils.aoa_to_sheet(lists);
    wsLists['!cols'] = [{ wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, wsLists, 'Allowed Values');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }
}
