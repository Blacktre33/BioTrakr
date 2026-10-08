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
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Response } from 'express';

import type { AuthUser } from '../../auth/auth-user';
import { CurrentUser, Roles } from '../../auth/decorators';
import { ASSET_EDITOR_ROLES, STAFF_ROLES } from '../../auth/roles';
import { MAX_IMPORT_FILE_BYTES } from './excel-import.rules';
import {
  ExcelImportService,
  type ImportCheck,
  type ImportResult,
} from './excel-import.service';

export interface UploadedMulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

/** One .xlsx file, size-capped before it is read into memory (larger -> 413). */
const UPLOAD = FileInterceptor('file', {
  limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: 1 },
});

function assertExcelFile(
  file: UploadedMulterFile | undefined,
): asserts file is UploadedMulterFile {
  if (!file) {
    throw new BadRequestException('No file uploaded');
  }
  const xlsx =
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (
    file.mimetype !== xlsx &&
    !file.originalname.toLowerCase().endsWith('.xlsx')
  ) {
    throw new BadRequestException('Please upload an Excel file (.xlsx)');
  }
}

@ApiTags('Excel Import/Export')
@ApiBearerAuth()
@Roles(...STAFF_ROLES)
@Controller('v1/assets')
export class ExcelImportController {
  private readonly logger = new Logger(ExcelImportController.name);

  constructor(private readonly excelImportService: ExcelImportService) {}

  /**
   * Import assets from an Excel file: all rows or none.
   */
  @Post('import')
  @Roles(...ASSET_EDITOR_ROLES)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(UPLOAD)
  @ApiOperation({
    summary:
      'Import assets from Excel. Saves every row or none: if any row has an error, nothing is written and the errors are returned.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Excel file (.xlsx), at most 5 MB',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description:
      'Import result (success=false with errors when nothing was saved)',
  })
  @ApiResponse({ status: 400, description: 'No file, or not an .xlsx file' })
  @ApiResponse({ status: 413, description: 'File larger than 5 MB' })
  async importAssets(
    @UploadedFile() file: UploadedMulterFile,
    @CurrentUser() user: AuthUser,
  ): Promise<ImportResult> {
    assertExcelFile(file);
    this.logger.log(`Importing assets from file: ${file.originalname}`);
    return this.excelImportService.importFromExcel(file.buffer, user);
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
    @CurrentUser() user: AuthUser,
    @Query('facilityId') facilityId?: string,
  ) {
    this.logger.log(
      `Exporting assets${facilityId ? ` for facility ${facilityId}` : ''}`,
    );

    const buffer = await this.excelImportService.exportToExcel(
      user.organizationId,
      facilityId,
    );

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
   * Check a file and preview the import. Never writes.
   */
  @Post('validate')
  @Roles(...ASSET_EDITOR_ROLES)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(UPLOAD)
  @ApiOperation({
    summary:
      'Check an Excel file and preview what an import would do. Nothing is saved.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Errors, warnings, counts and a preview of the first rows',
  })
  async validateFile(
    @UploadedFile() file: UploadedMulterFile,
    @CurrentUser() user: AuthUser,
  ): Promise<ImportCheck> {
    assertExcelFile(file);
    return this.excelImportService.checkFile(file.buffer, user);
  }
}
