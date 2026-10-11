import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { BIOMED_ROLES, DOCUMENT_READ_ROLES } from '../auth/roles';
import {
  DOCUMENT_TARGETS,
  ListDocumentsQuery,
  UploadDocumentDto,
  WithdrawDocumentDto,
} from './documents.dto';
import {
  DocumentsService,
  type UploadedFile as File,
} from './documents.service';
import { MAX_DOCUMENT_BYTES } from './file-type';

/** One file, size-capped before it is read into memory (larger: 413). */
const UPLOAD = FileInterceptor('file', {
  limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 },
});

@ApiTags('documents')
@ApiBearerAuth()
@Roles(...BIOMED_ROLES)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @Roles(...DOCUMENT_READ_ROLES)
  @ApiOperation({ summary: 'Files attached to a device or record' })
  list(@Query() query: ListDocumentsQuery, @CurrentUser() user: AuthUser) {
    return this.documents.list(query, user);
  }

  @Post()
  @HttpCode(201)
  @UseInterceptors(UPLOAD)
  @ApiOperation({
    summary:
      'Attach a PDF, JPEG or PNG (at most 10 MB) to a device, calibration, safety test, contract or work order',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'targetType', 'targetId'],
      properties: {
        file: { type: 'string', format: 'binary' },
        targetType: { type: 'string', enum: [...DOCUMENT_TARGETS] },
        targetId: { type: 'string', format: 'uuid' },
        category: { type: 'string' },
        title: { type: 'string' },
      },
    },
  })
  upload(
    @UploadedFile() file: File | undefined,
    @Body() dto: UploadDocumentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.documents.upload(file, dto, user);
  }

  @Get(':id/file')
  @Roles(...DOCUMENT_READ_ROLES)
  @ApiOperation({ summary: 'Download a file' })
  async download(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const doc = await this.documents.content(id, user);
    const ascii = doc.fileName.replace(/[^\x20-\x7e]/g, '_');
    res.set({
      'Content-Type': doc.mimeType,
      'Content-Length': String(doc.content.length),
      // Always a download: the web app opens it from a blob, never inline here.
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': 'sandbox',
      'Cache-Control': 'private, no-store',
    });
    res.end(doc.content);
  }

  @Post(':id/withdrawal')
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Withdraw a file (wrong file or record): it stays on record, marked',
  })
  withdraw(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: WithdrawDocumentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.documents.withdraw(id, dto, user);
  }
}
