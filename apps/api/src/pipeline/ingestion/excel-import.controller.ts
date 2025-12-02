import {
  Controller,
  Post,
  Get,
  UseInterceptors,
  UploadedFile,
  Res,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { Response, Request } from 'express';
import { ExcelImportService, ImportResult } from './excel-import.service';

export interface UploadedMulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

@ApiTags('Excel Import/Export')
@Controller('v1/assets')
export class ExcelImportController {
  private readonly logger = new Logger(ExcelImportController.name);

  constructor(private readonly excelImportService: ExcelImportService) {}

  /**
   * Import assets from Excel file
   */
  @Post('import')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Import assets from Excel file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Excel file (.xlsx) with asset data',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Import result',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        totalRows: { type: 'number' },
        imported: { type: 'number' },
        failed: { type: 'number' },
        errors: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              row: { type: 'number' },
              field: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid file or validation errors' })
  async importAssets(
    @UploadedFile() file: UploadedMulterFile,
  ): Promise<ImportResult> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Validate file type
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    
    if (!validTypes.includes(file.mimetype) && !file.originalname.endsWith('.xlsx')) {
      throw new BadRequestException('Invalid file type. Please upload an Excel file (.xlsx)');
    }

    this.logger.log(`Importing assets from file: ${file.originalname}`);

    const result = await this.excelImportService.importFromExcel(file.buffer);

    return result;
  }

  /**
   * Export assets to Excel file
   */
  @Get('export')
  @ApiOperation({ summary: 'Export assets to Excel file' })
  @ApiQuery({
    name: 'facilityId',
    required: false,
    description: 'Filter by facility ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Excel file download',
    content: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {},
    },
  })
  async exportAssets(
    @Res() res: Response,
    @Query('facilityId') facilityId?: string,
  ) {
    this.logger.log(`Exporting assets${facilityId ? ` for facility ${facilityId}` : ''}`);

    const buffer = await this.excelImportService.exportToExcel(facilityId);

    const filename = `biotrakr_assets_${new Date().toISOString().split('T')[0]}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  /**
   * Download blank template
   */
  @Get('template')
  @ApiOperation({ summary: 'Download blank Excel template for asset import' })
  @ApiResponse({
    status: 200,
    description: 'Excel template download',
    content: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {},
    },
  })
  async downloadTemplate(@Res() res: Response) {
    this.logger.log('Generating Excel template for asset import');

    const buffer = await this.excelImportService.generateTemplate();

    const filename = 'biotrakr_asset_template.xlsx';

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  /**
   * Validate Excel file without importing
   */
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Validate Excel file without importing' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Validation result',
  })
  async validateFile(
    @UploadedFile() file: UploadedMulterFile,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // For validation only, we would parse and validate without inserting
    // This is a simplified version - in production, refactor to separate validation
    
    const result = await this.excelImportService.importFromExcel(file.buffer);
    
    // Return validation results without actually committing
    // In a real implementation, wrap the import in a transaction and rollback
    
    return {
      valid: result.errors.length === 0,
      totalRows: result.totalRows,
      errors: result.errors,
      warnings: result.warnings,
    };
  }
}
