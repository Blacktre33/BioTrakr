import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';

interface AssetRow {
  'Asset Tag*': string;
  'Serial Number'?: string;
  'Barcode'?: string;
  'Asset Category*': string;
  'Asset Type*': string;
  'Manufacturer*': string;
  'Model Number*': string;
  'Facility Code*': string;
  'Department Code'?: string;
  'Location Code'?: string;
  'Status*': string;
  'Condition*': string;
  'Acquisition Date'?: string;
  'Installation Date'?: string;
  'Warranty Expiry'?: string;
  'Purchase Price'?: number;
  'UDI'?: string;
  'Lot Number'?: string;
  'Is FDA Regulated'?: string;
  'Is RTLS Tracked'?: string;
  'RTLS Tag ID'?: string;
  'BLE Beacon ID'?: string;
  'Notes'?: string;
}

interface QuickEntryRow {
  'Asset Tag*': string;
  'Serial Number'?: string;
  'Asset Type*': string;
  'Manufacturer*': string;
  'Model Number*': string;
  'Facility Code*': string;
  'Department Code'?: string;
  'Status*': string;
}

interface ImportResult {
  success: boolean;
  totalRows: number;
  imported: number;
  failed: number;
  errors: Array<{
    row: number;
    field: string;
    message: string;
    value?: any;
  }>;
  warnings: Array<{
    row: number;
    message: string;
  }>;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
  value?: any;
}

@Injectable()
export class ExcelImportService {
  private readonly logger = new Logger(ExcelImportService.name);

  // Valid values for validation
  private readonly validCategories = [
    'diagnostic_imaging',
    'life_support',
    'surgical',
    'laboratory',
    'patient_care',
    'infrastructure',
  ];

  private readonly validStatuses = [
    'AVAILABLE',
    'IN_USE',
    'MAINTENANCE',
    'REPAIR',
    'DECOMMISSIONED',
    'QUARANTINE',
  ];

  private readonly validConditions = [
    'EXCELLENT',
    'GOOD',
    'FAIR',
    'POOR',
    'CRITICAL',
    'UNKNOWN',
  ];

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Import assets from Excel file buffer
   */
  async importFromExcel(
    fileBuffer: Buffer,
    userId?: string,
  ): Promise<ImportResult> {
    const result: ImportResult = {
      success: false,
      totalRows: 0,
      imported: 0,
      failed: 0,
      errors: [],
      warnings: [],
    };

    try {
      // Parse Excel file
      const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });

      // Try to find data sheet
      let sheetName = 'Asset Entry';
      if (!workbook.SheetNames.includes(sheetName)) {
        sheetName = 'Quick Entry';
        if (!workbook.SheetNames.includes(sheetName)) {
          sheetName = workbook.SheetNames[0];
        }
      }

      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<AssetRow | QuickEntryRow>(worksheet, {
        defval: null,
        raw: false,
      });

      // Filter out empty rows and sample data
      const dataRows = rows.filter((row, index) => {
        const assetTag = row['Asset Tag*'];
        // Skip empty rows and sample data (italic gray text)
        if (!assetTag || assetTag === 'BT-2025-001') {
          return false;
        }
        return true;
      });

      result.totalRows = dataRows.length;

      if (dataRows.length === 0) {
        result.errors.push({
          row: 0,
          field: 'file',
          message: 'No data rows found in the Excel file',
        });
        return result;
      }

      // Process each row
      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const rowNum = i + 2; // Excel row number (1-indexed + header)

        try {
          // Validate row
          const validationErrors = this.validateRow(row, rowNum);
          if (validationErrors.length > 0) {
            result.errors.push(...validationErrors);
            result.failed++;
            continue;
          }

          // Import the asset
          await this.importAsset(row as AssetRow, userId);
          result.imported++;
        } catch (error) {
          result.errors.push({
            row: rowNum,
            field: 'database',
            message: error.message,
          });
          result.failed++;
        }
      }

      result.success = result.failed === 0;

      this.logger.log(
        `Import complete: ${result.imported} imported, ${result.failed} failed out of ${result.totalRows} rows`,
      );

      return result;
    } catch (error) {
      this.logger.error(`Excel import failed: ${error.message}`, error.stack);
      result.errors.push({
        row: 0,
        field: 'file',
        message: `Failed to parse Excel file: ${error.message}`,
      });
      return result;
    }
  }

  /**
   * Validate a single row
   */
  private validateRow(
    row: AssetRow | QuickEntryRow,
    rowNum: number,
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    // Required fields
    if (!row['Asset Tag*']) {
      errors.push({
        row: rowNum,
        field: 'Asset Tag',
        message: 'Asset Tag is required',
      });
    }

    if (!row['Manufacturer*']) {
      errors.push({
        row: rowNum,
        field: 'Manufacturer',
        message: 'Manufacturer is required',
      });
    }

    if (!row['Model Number*']) {
      errors.push({
        row: rowNum,
        field: 'Model Number',
        message: 'Model Number is required',
      });
    }

    if (!row['Facility Code*']) {
      errors.push({
        row: rowNum,
        field: 'Facility Code',
        message: 'Facility Code is required',
      });
    }

    // Full entry specific validations
    const fullRow = row as AssetRow;

    if (fullRow['Status*']) {
      const status = fullRow['Status*'].toUpperCase().replace(' ', '_');
      if (!this.validStatuses.includes(status)) {
        errors.push({
          row: rowNum,
          field: 'Status',
          message: `Invalid status: ${fullRow['Status*']}`,
          value: fullRow['Status*'],
        });
      }
    }

    if (fullRow['Condition*']) {
      const condition = fullRow['Condition*'].toUpperCase();
      if (!this.validConditions.includes(condition)) {
        errors.push({
          row: rowNum,
          field: 'Condition',
          message: `Invalid condition: ${fullRow['Condition*']}`,
          value: fullRow['Condition*'],
        });
      }
    }

    // Date validations
    if (fullRow['Acquisition Date']) {
      if (!this.isValidDate(fullRow['Acquisition Date'])) {
        errors.push({
          row: rowNum,
          field: 'Acquisition Date',
          message: 'Invalid date format. Use YYYY-MM-DD',
          value: fullRow['Acquisition Date'],
        });
      }
    }

    // Price validation
    if (fullRow['Purchase Price']) {
      const price = parseFloat(String(fullRow['Purchase Price']));
      if (isNaN(price) || price < 0) {
        errors.push({
          row: rowNum,
          field: 'Purchase Price',
          message: 'Invalid price value',
          value: fullRow['Purchase Price'],
        });
      }
    }

    return errors;
  }

  /**
   * Import a single asset row into the database
   */
  private async importAsset(row: AssetRow, userId?: string): Promise<void> {
    // Resolve or create related entities
    const facility = await this.getOrCreateFacility(row['Facility Code*']);
    const department = row['Department Code']
      ? await this.getOrCreateDepartment(
          row['Department Code'],
          facility.id,
        )
      : null;
    const manufacturer = await this.getOrCreateManufacturer(
      row['Manufacturer*'],
    );

    // Map status and condition to Prisma enums
    const assetStatus = this.mapStatus(row['Status*']);
    const assetCondition = this.mapCondition(row['Condition*'] || 'good');

    // Create asset using Prisma
    await this.prisma.asset.upsert({
      where: { assetTagNumber: row['Asset Tag*'] },
      create: {
        id: uuidv4(),
        organizationId: facility.organizationId || uuidv4(), // Default org if not set
        assetTagNumber: row['Asset Tag*'],
        equipmentName: `${row['Manufacturer*']} ${row['Model Number*']}`,
        manufacturer: row['Manufacturer*'],
        modelNumber: row['Model Number*'],
        serialNumber: row['Serial Number'] || '',
        deviceCategory: 'OTHER', // Default, can be enhanced
        assetStatus,
        criticalityLevel: 'MEDIUM', // Default
        currentFacilityId: facility.id,
        purchaseDate: this.parseDate(row['Acquisition Date']) || new Date(),
        installationDate: this.parseDate(row['Installation Date']),
        warrantyEndDate: this.parseDate(row['Warranty Expiry']),
        purchaseCost: row['Purchase Price']
          ? parseFloat(String(row['Purchase Price']))
          : 0,
        udiDeviceIdentifier: row['UDI'] || null,
        lotNumber: row['Lot Number'] || null,
        isTrackedRtls: this.parseYesNo(row['Is RTLS Tracked']),
        rtlsTagId: row['RTLS Tag ID'] || null,
        bleBeaconId: row['BLE Beacon ID'] || null,
        notes: row['Notes'] || null,
        primaryCustodianId: userId || uuidv4(), // Default user
        custodianDepartmentId: department?.id || facility.id,
      },
      update: {
        serialNumber: row['Serial Number'] || undefined,
        manufacturer: row['Manufacturer*'],
        modelNumber: row['Model Number*'],
        assetStatus,
        currentFacilityId: facility.id,
        updatedAt: new Date(),
      },
    });
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private async getOrCreateFacility(code: string) {
    const facility = await this.prisma.facility.findFirst({
      where: { name: { contains: code, mode: 'insensitive' } },
    });

    if (facility) {
      return facility;
    }

    // Create new facility
    return this.prisma.facility.create({
      data: {
        id: uuidv4(),
        organizationId: uuidv4(), // Default org - should be set properly
        name: code,
        address: {},
        timezone: 'UTC',
      },
    });
  }

  private async getOrCreateDepartment(code: string, facilityId: string) {
    const department = await this.prisma.department.findFirst({
      where: {
        facilityId,
        code: { equals: code, mode: 'insensitive' },
      },
    });

    if (department) {
      return department;
    }

    return this.prisma.department.create({
      data: {
        id: uuidv4(),
        facilityId,
        name: code,
        code: code.toUpperCase(),
      },
    });
  }

  private async getOrCreateManufacturer(name: string): Promise<string> {
    // Manufacturer is stored as a string field in Asset model
    // No separate Manufacturer model exists in current schema
    return name;
  }

  private mapStatus(status: string): string {
    const statusMap: Record<string, string> = {
      available: 'AVAILABLE',
      'in_use': 'IN_USE',
      maintenance: 'MAINTENANCE',
      repair: 'REPAIR',
      decommissioned: 'DECOMMISSIONED',
      quarantine: 'QUARANTINE',
    };
    return statusMap[status.toLowerCase()] || 'AVAILABLE';
  }

  private mapCondition(condition: string): string {
    const conditionMap: Record<string, string> = {
      excellent: 'EXCELLENT',
      good: 'GOOD',
      fair: 'FAIR',
      poor: 'POOR',
      critical: 'CRITICAL',
    };
    return conditionMap[condition.toLowerCase()] || 'GOOD';
  }

  private isValidDate(value: any): boolean {
    if (!value) return true;
    const date = new Date(value);
    return !isNaN(date.getTime());
  }

  private parseDate(value: any): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  private parseYesNo(value: any): boolean {
    if (!value) return false;
    const str = String(value).toLowerCase();
    return str === 'yes' || str === 'true' || str === '1' || str === 'y';
  }

  /**
   * Export assets to Excel format
   */
  async exportToExcel(facilityId?: string): Promise<Buffer> {
    const whereClause = facilityId ? { currentFacilityId: facilityId } : {};

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
      'Manufacturer': a.manufacturer,
      'Model Number': a.modelNumber,
      'Facility': a.currentFacility?.name || '',
      'Status': a.assetStatus,
      'Acquisition Date': a.purchaseDate,
      'Installation Date': a.installationDate,
      'Warranty Expiry': a.warrantyEndDate,
      'Purchase Price': a.purchaseCost,
      'UDI': a.udiDeviceIdentifier,
      'RTLS Tracked': a.isTrackedRtls ? 'Yes' : 'No',
      'RTLS Tag ID': a.rtlsTagId,
      'BLE Beacon ID': a.bleBeaconId,
      'Notes': a.notes,
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);
    XLSX.utils.book_append_sheet(wb, ws, 'Assets');

    // Write to buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return buffer;
  }
}
