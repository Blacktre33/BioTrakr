import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContractType, VendorType } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Digits with spaces, dashes or brackets; toll-free numbers included. */
const PHONE = /^\+?[\d\s()-]{6,20}$/;

export class VendorInputDto {
  @ApiProperty({ example: 'Philips Healthcare India' })
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: "Enter the vendor's name" })
  @MaxLength(200)
  vendorName!: string;

  @ApiProperty({ enum: VendorType })
  @IsEnum(VendorType)
  vendorType!: VendorType;

  @ApiPropertyOptional({
    description: 'Who to ask for (service engineer, account manager)',
  })
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  @IsOptional()
  contactPerson?: string;

  @ApiPropertyOptional({ example: '1800 102 2929' })
  @Transform(trim)
  @IsString()
  @Matches(PHONE, { message: 'Enter a phone number such as 1800 102 2929' })
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional()
  @Transform(trim)
  @IsEmail({}, { message: 'Enter an email address' })
  @MaxLength(200)
  @IsOptional()
  email?: string;

  @ApiPropertyOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  @IsOptional()
  address?: string;
}

/** Every field optional: only what is sent changes. */
export class UpdateVendorDto {
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: "Enter the vendor's name" })
  @MaxLength(200)
  @IsOptional()
  vendorName?: string;

  @IsEnum(VendorType)
  @IsOptional()
  vendorType?: VendorType;

  @Transform(trim)
  @IsString()
  @MaxLength(200)
  @IsOptional()
  contactPerson?: string;

  @Transform(trim)
  @IsString()
  @Matches(/^$|^\+?[\d\s()-]{6,20}$/, {
    message: 'Enter a phone number such as 1800 102 2929',
  })
  @IsOptional()
  phone?: string;

  @Transform(trim)
  @Matches(/^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
    message: 'Enter an email address',
  })
  @MaxLength(200)
  @IsOptional()
  email?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(500)
  @IsOptional()
  address?: string;
}

export class ContractInputDto {
  @ApiProperty()
  @IsUUID('all', { message: 'Choose the vendor' })
  vendorId!: string;

  @ApiProperty({ enum: ContractType })
  @IsEnum(ContractType)
  contractType!: ContractType;

  @ApiProperty({ description: 'Contract, work order or purchase order number' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Enter the contract or PO number' })
  @MaxLength(100)
  contractNumber!: string;

  @ApiProperty({ description: 'First day of cover' })
  @IsDateString({}, { message: 'Enter the start date' })
  startDate!: string;

  @ApiProperty({ description: 'Last day of cover' })
  @IsDateString({}, { message: 'Enter the end date' })
  endDate!: string;

  @ApiPropertyOptional({
    description: 'For one year, all covered devices together (INR)',
  })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Enter an amount in rupees' })
  @Min(0)
  @Max(9_999_999_999)
  @IsOptional()
  annualValue?: number;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @Max(52)
  @IsOptional()
  pmVisitsPerYear?: number;

  @ApiPropertyOptional({
    description: 'Hours the vendor has to attend a breakdown',
  })
  @IsInt()
  @Min(1)
  @Max(720)
  @IsOptional()
  responseTimeHours?: number;

  @ApiPropertyOptional({ description: 'Guaranteed uptime, per cent' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  @IsOptional()
  uptimeGuaranteePercent?: number;

  @ApiProperty({ description: 'The devices it covers' })
  @IsArray()
  @ArrayMinSize(1, { message: 'Choose at least one device' })
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  deviceIds!: string[];

  @ApiPropertyOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  notes?: string;
}

export class TerminateContractDto {
  @ApiProperty({ description: 'Why it ends early' })
  @Transform(trim)
  @IsString()
  @MinLength(5, { message: 'Say why the contract ends early' })
  @MaxLength(1000)
  reason!: string;
}

export const CONTRACT_FILTERS = [
  'current',
  'ending',
  'expired',
  'terminated',
  'all',
] as const;
export type ContractFilter = (typeof CONTRACT_FILTERS)[number];

export class ListContractsQuery {
  @ApiPropertyOptional({
    enum: CONTRACT_FILTERS,
    description:
      'current: in force or starting later; ending: in force, ending within 90 days and not renewed',
  })
  @IsIn(CONTRACT_FILTERS)
  @IsOptional()
  status?: ContractFilter;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  vendorId?: string;
}
