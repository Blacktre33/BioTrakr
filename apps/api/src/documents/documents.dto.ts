import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentCategory } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** What a document can belong to. */
export const DOCUMENT_TARGETS = [
  'asset',
  'calibration',
  'safetyTest',
  'contract',
  'workOrder',
  'condemnation',
] as const;
export type DocumentTarget = (typeof DOCUMENT_TARGETS)[number];

/** The form fields sent with the file (multipart/form-data). */
export class UploadDocumentDto {
  @ApiProperty({ enum: DOCUMENT_TARGETS })
  @IsIn(DOCUMENT_TARGETS)
  targetType!: DocumentTarget;

  @ApiProperty()
  @IsUUID()
  targetId!: string;

  @ApiPropertyOptional({
    enum: DocumentCategory,
    description: 'Defaults from what it is attached to',
  })
  @IsEnum(DocumentCategory)
  @IsOptional()
  category?: DocumentCategory;

  @ApiPropertyOptional({ description: 'Defaults to the file name' })
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  @IsOptional()
  title?: string;
}

export class ListDocumentsQuery {
  @ApiProperty({
    enum: DOCUMENT_TARGETS,
    description:
      "asset: everything about the device, its records' files included",
  })
  @IsIn(DOCUMENT_TARGETS)
  targetType!: DocumentTarget;

  @ApiProperty()
  @IsUUID()
  targetId!: string;
}

export class WithdrawDocumentDto {
  @ApiProperty({ description: 'Why it is withdrawn' })
  @Transform(trim)
  @IsString()
  @MinLength(5, { message: 'Say why the file is withdrawn' })
  @MaxLength(1000)
  reason!: string;
}
