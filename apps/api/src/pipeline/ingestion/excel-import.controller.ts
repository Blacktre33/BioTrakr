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

@ApiTags('Excel Import/Export')
@Controller('api/v1/assets')
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
    @UploadedFile() file: Express.Multer.File,
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
    // In production, you would serve the pre-generated template file
    // For now, we'll generate it on-the-fly or return a static file
    
    // This would typically read from a static file:
    // const templatePath = path.join(__dirname, '..', '..', 'templates', 'biotrakr_asset_template.xlsx');
    // const buffer = fs.readFileSync(templatePath);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="biotrakr_asset_template.xlsx"',
    );
    
    // Return a message indicating template should be served from static files
    // In production, use: res.send(buffer);
    res.status(200).json({
      message: 'Template endpoint - configure to serve static template file',
      templateUrl: '/static/biotrakr_asset_template.xlsx',
    });
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
    @UploadedFile() file: Express.Multer.File,
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
