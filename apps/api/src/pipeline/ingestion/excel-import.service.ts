import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import { AssetStatus, RiskClassification } from '@prisma/client';

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

export interface ImportResult {
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
   * Get value from row with flexible column name matching
   * Supports both 'Asset Tag*' and 'Asset Tag' formats
   */
  private getRowValue(row: Record<string, any>, columnName: string): any {
    // Try exact match first
    if (row[columnName] !== undefined) {
      return row[columnName];
    }
    // Try with asterisk
    if (row[`${columnName}*`] !== undefined) {
      return row[`${columnName}*`];
    }
    // Try without asterisk (if columnName has one)
    const nameWithoutAsterisk = columnName.replace('*', '');
    if (row[nameWithoutAsterisk] !== undefined) {
      return row[nameWithoutAsterisk];
    }
    return null;
  }

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

      // Try to find data sheet - support multiple sheet name conventions
      const sheetPreferences = ['Asset Entry', 'Quick Entry', 'Assets', 'Sheet1'];
      let sheetName = sheetPreferences.find(name => workbook.SheetNames.includes(name))
        || workbook.SheetNames[0];

      this.logger.log(`Using sheet: "${sheetName}" from available sheets: [${workbook.SheetNames.join(', ')}]`);

      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<AssetRow | QuickEntryRow>(worksheet, {
        defval: null,
        raw: false,
      });

      // Filter out empty rows and sample data
      const dataRows = rows.filter((row, index) => {
        const assetTag = this.getRowValue(row, 'Asset Tag');
        // Skip empty rows and sample data (example from template)
        const sampleAssetTags = ['BT-2025-001', 'ASSET-001'];
        if (!assetTag || sampleAssetTags.includes(String(assetTag).trim())) {
          return false;
        }
        return true;
      });

      result.totalRows = dataRows.length;

      if (dataRows.length === 0) {
        // Provide helpful debug info
        const columnNames = rows.length > 0 ? Object.keys(rows[0] || {}).join(', ') : 'none';
        this.logger.warn(`No data rows found. Total rows parsed: ${rows.length}. Columns found: ${columnNames}`);

        let errorMessage = 'No data rows found in the Excel file';
        if (rows.length === 0) {
          errorMessage = 'The Excel file appears to be empty. Make sure your data is in the first sheet.';
        } else if (rows.length === 1) {
          errorMessage = 'Only the example row was found. Please add your asset data below the example row, or delete the example and add your own data.';
        } else {
          errorMessage = `Found ${rows.length} rows but none with valid Asset Tag values. Columns detected: ${columnNames}`;
        }

        result.errors.push({
          row: 0,
          field: 'file',
          message: errorMessage,
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

    // Use flexible column matching for all fields
    const assetTag = this.getRowValue(row, 'Asset Tag');
    const manufacturer = this.getRowValue(row, 'Manufacturer');
    const modelNumber = this.getRowValue(row, 'Model Number');
    const facilityCode = this.getRowValue(row, 'Facility Code');
    const status = this.getRowValue(row, 'Status');
    const condition = this.getRowValue(row, 'Condition');
    const acquisitionDate = this.getRowValue(row, 'Acquisition Date');
    const purchasePrice = this.getRowValue(row, 'Purchase Price');

    // Required fields
    if (!assetTag) {
      errors.push({
        row: rowNum,
        field: 'Asset Tag',
        message: 'Asset Tag is required',
      });
    }

    if (!manufacturer) {
      errors.push({
        row: rowNum,
        field: 'Manufacturer',
        message: 'Manufacturer is required',
      });
    }

    if (!modelNumber) {
      errors.push({
        row: rowNum,
        field: 'Model Number',
        message: 'Model Number is required',
      });
    }

    if (!facilityCode) {
      errors.push({
        row: rowNum,
        field: 'Facility Code',
        message: 'Facility Code is required',
      });
    }

    // Status validation
    if (status) {
      const statusUpper = String(status).toUpperCase().replace(' ', '_');
      if (!this.validStatuses.includes(statusUpper)) {
        errors.push({
          row: rowNum,
          field: 'Status',
          message: `Invalid status: ${status}`,
          value: status,
        });
      }
    }

    // Condition validation
    if (condition) {
      const conditionUpper = String(condition).toUpperCase();
      if (!this.validConditions.includes(conditionUpper)) {
        errors.push({
          row: rowNum,
          field: 'Condition',
          message: `Invalid condition: ${condition}`,
          value: condition,
        });
      }
    }

    // Date validations
    if (acquisitionDate) {
      if (!this.isValidDate(acquisitionDate)) {
        errors.push({
          row: rowNum,
          field: 'Acquisition Date',
          message: 'Invalid date format. Use YYYY-MM-DD',
          value: acquisitionDate,
        });
      }
    }

    // Price validation
    if (purchasePrice) {
      const price = parseFloat(String(purchasePrice));
      if (isNaN(price) || price < 0) {
        errors.push({
          row: rowNum,
          field: 'Purchase Price',
          message: 'Invalid price value',
          value: purchasePrice,
        });
      }
    }

    return errors;
  }

  /**
   * Import a single asset row into the database
   */
  private async importAsset(row: AssetRow, userId?: string): Promise<void> {
    // Extract values using flexible column matching
    const assetTag = this.getRowValue(row, 'Asset Tag');
    const serialNumber = this.getRowValue(row, 'Serial Number');
    const manufacturerName = this.getRowValue(row, 'Manufacturer');
    const modelNumber = this.getRowValue(row, 'Model Number');
    const facilityCode = this.getRowValue(row, 'Facility Code');
    const departmentCode = this.getRowValue(row, 'Department Code');
    const status = this.getRowValue(row, 'Status');
    const condition = this.getRowValue(row, 'Condition');
    const acquisitionDate = this.getRowValue(row, 'Acquisition Date');
    const installationDate = this.getRowValue(row, 'Installation Date');
    const warrantyExpiry = this.getRowValue(row, 'Warranty Expiry');
    const purchasePrice = this.getRowValue(row, 'Purchase Price');
    const udi = this.getRowValue(row, 'UDI');
    const rtlsTagId = this.getRowValue(row, 'RTLS Tag ID');
    const bleBeaconId = this.getRowValue(row, 'BLE Beacon ID');
    const notes = this.getRowValue(row, 'Notes');

    // Resolve or create related entities
    const facility = await this.getOrCreateFacility(facilityCode);
    const department = departmentCode
      ? await this.getOrCreateDepartment(departmentCode, facility.id)
      : null;
    const manufacturer = await this.getOrCreateManufacturer(manufacturerName);

    const assetStatus = this.mapStatus(status || 'AVAILABLE') as AssetStatus;
    const assetCondition = this.mapCondition(condition || 'good');

    // Create asset using Prisma
    await this.prisma.asset.upsert({
      where: { assetTagNumber: assetTag },
      create: {
        id: uuidv4(),
        organizationId: facility.organizationId || uuidv4(), // Default org if not set
        assetTagNumber: assetTag,
        equipmentName: `${manufacturerName} ${modelNumber}`,
        manufacturer: manufacturerName,
        modelNumber: modelNumber,
        serialNumber: serialNumber || '',
        deviceCategory: 'OTHER', // Default, can be enhanced
        assetStatus,
        criticalityLevel: 'MEDIUM', // Default
        currentFacilityId: facility.id,
        usefulLifeYears: 10, // Default
        riskClassification: RiskClassification.CLASS_I, // Default
        purchaseDate: this.parseDate(acquisitionDate) || new Date(),
        installationDate: this.parseDate(installationDate),
        warrantyEndDate: this.parseDate(warrantyExpiry),
        purchaseCost: purchasePrice ? parseFloat(String(purchasePrice)) : 0,
        udiDeviceIdentifier: udi || null,
        rfidTagId: rtlsTagId || null,
        bleBeaconMac: bleBeaconId || null,
        notes: notes || null,
        primaryCustodianId: userId || uuidv4(), // Default user
        custodianDepartmentId: department?.id || facility.id,
        createdById: userId || uuidv4(),
        updatedById: userId || uuidv4(),
      },
      update: {
        serialNumber: serialNumber || undefined,
        manufacturer: manufacturerName,
        modelNumber: modelNumber,
        assetStatus,
        currentFacilityId: facility.id,
        updatedAt: new Date(),
        updatedById: userId || uuidv4(),
      },
    });
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private async getOrCreateFacility(code: string) {
    const facility = await this.prisma.facility.findFirst({
      where: { facilityName: { contains: code, mode: 'insensitive' } },
    });

    if (facility) {
      return facility;
    }

    // Create new facility
    return this.prisma.facility.create({
      data: {
        id: uuidv4(),
        organizationId: uuidv4(), // Default org - should be set properly
        facilityName: code,
        facilityCode: code.toUpperCase().replace(/\s+/g, '_'),
        timezone: 'UTC',
      },
    });
  }

  private async getOrCreateDepartment(code: string, facilityId: string) {
    const department = await this.prisma.department.findFirst({
      where: {
        facilityId,
        departmentCode: { equals: code, mode: 'insensitive' },
      },
    });

    if (department) {
      return department;
    }

    return this.prisma.department.create({
      data: {
        id: uuidv4(),
        facilityId,
        departmentName: code,
        departmentCode: code.toUpperCase(),
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
      'Facility': a.currentFacility?.facilityName || '',
      'Status': a.assetStatus,
      'Acquisition Date': a.purchaseDate,
      'Installation Date': a.installationDate,
      'Warranty Expiry': a.warrantyEndDate,
      'Purchase Price': a.purchaseCost,
      'UDI': a.udiDeviceIdentifier,
      'RTLS Tracked': a.rfidTagId || a.bleBeaconMac ? 'Yes' : 'No',
      'RTLS Tag ID': a.rfidTagId,
      'BLE Beacon ID': a.bleBeaconMac,
      'Notes': a.notes,
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);
    XLSX.utils.book_append_sheet(wb, ws, 'Assets');

    // Write to buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return buffer;
  }

  /**
   * Generate a blank Excel template for asset import
   */
  async generateTemplate(): Promise<Buffer> {
    // Create workbook
    const wb = XLSX.utils.book_new();

    // Define the template headers based on AssetRow interface
    const headers = [
      'Asset Tag*',
      'Serial Number',
      'Barcode',
      'Asset Category*',
      'Asset Type*',
      'Manufacturer*',
      'Model Number*',
      'Facility Code*',
      'Department Code',
      'Location Code',
      'Status*',
      'Condition*',
      'Acquisition Date',
      'Installation Date',
      'Warranty Expiry',
      'Purchase Price',
      'UDI',
      'Lot Number',
      'Is FDA Regulated',
      'Is RTLS Tracked',
      'RTLS Tag ID',
      'BLE Beacon ID',
      'Notes',
    ];

    // Create worksheet with headers
    const ws = XLSX.utils.aoa_to_sheet([headers]);

    // Set column widths for better readability
    const colWidths = headers.map((header) => ({
      wch: Math.max(header.length + 2, 15),
    }));
    ws['!cols'] = colWidths;

    // Add example row with instructions
    const exampleRow = [
      'ASSET-001',
      'SN123456',
      'BC789',
      'Medical Equipment',
      'Ventilator',
      'Philips',
      'V60',
      'FACILITY-001',
      'ICU',
      'ICU-ROOM-101',
      'Available',
      'Excellent',
      '2024-01-15',
      '2024-01-20',
      '2025-01-15',
      '50000',
      'UDI123456',
      'LOT001',
      'Yes',
      'Yes',
      'RFID-001',
      'BLE-001',
      'Sample asset entry',
    ];
    XLSX.utils.sheet_add_aoa(ws, [exampleRow], { origin: -1 });

    // Add instructions sheet
    const instructions = [
      ['BioTrakr Asset Import Template'],
      [],
      ['Instructions:'],
      ['1. Required fields are marked with *'],
      ['2. Status values: Available, In_Use, Maintenance, Repair, Decommissioned, Quarantine'],
      ['3. Condition values: Excellent, Good, Fair, Poor, Critical'],
      ['4. Date format: YYYY-MM-DD (e.g., 2024-01-15)'],
      ['5. Yes/No fields: Use "Yes" or "No"'],
      ['6. Delete the example row before importing'],
      [],
      ['Column Descriptions:'],
      ['Asset Tag*: Unique identifier for the asset'],
      ['Serial Number: Manufacturer serial number'],
      ['Barcode: Barcode identifier'],
      ['Asset Category*: Category of the asset (e.g., Medical Equipment)'],
      ['Asset Type*: Specific type (e.g., Ventilator, Monitor)'],
      ['Manufacturer*: Manufacturer name'],
      ['Model Number*: Model identifier'],
      ['Facility Code*: Code of the facility'],
      ['Department Code: Department code'],
      ['Location Code: Location within facility'],
      ['Status*: Current status of the asset'],
      ['Condition*: Physical condition'],
      ['Acquisition Date: Date asset was acquired'],
      ['Installation Date: Date asset was installed'],
      ['Warranty Expiry: Warranty expiration date'],
      ['Purchase Price: Purchase cost in rupees'],
      ['UDI: Unique Device Identifier'],
      ['Lot Number: Lot/batch number'],
      ['Is FDA Regulated: Yes/No'],
      ['Is RTLS Tracked: Yes/No'],
      ['RTLS Tag ID: RFID tag identifier'],
      ['BLE Beacon ID: Bluetooth beacon MAC address'],
      ['Notes: Additional notes'],
    ];
    const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
    wsInstructions['!cols'] = [{ wch: 50 }];

    // Append sheets to workbook - use 'Asset Entry' to match importer expectations
    XLSX.utils.book_append_sheet(wb, ws, 'Asset Entry');
    XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions');

    // Write to buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return buffer;
  }
}
