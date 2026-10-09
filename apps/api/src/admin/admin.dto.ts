import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

import { ALL_ROLES, type Role } from '../auth/roles';

/** Codes appear on labels and in spreadsheets: short, no spaces. */
const CODE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const CODE_MESSAGE =
  'Use letters, numbers, - or _ only (no spaces), starting with a letter or number';

@ValidatorConstraint({ name: 'timezone' })
class IsTimeZone implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }
  defaultMessage(): string {
    return 'Use a time zone name such as Asia/Kolkata';
  }
}

// ---------------------------------------------------------------- facilities

export class CreateFacilityDto {
  @ApiProperty({ example: 'CG' })
  @IsString()
  @MaxLength(30)
  @Matches(CODE, { message: CODE_MESSAGE })
  facilityCode!: string;

  @ApiProperty({ example: 'City General Hospital' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  facilityName!: string;

  @ApiPropertyOptional({ example: 'Hospital' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  facilityType?: string;

  @ApiPropertyOptional({ example: 'Mangaluru' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ example: 'Asia/Kolkata' })
  @Validate(IsTimeZone)
  @IsOptional()
  timezone?: string;
}

export class UpdateFacilityDto {
  @IsString()
  @MaxLength(30)
  @Matches(CODE, { message: CODE_MESSAGE })
  @IsOptional()
  facilityCode?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @IsOptional()
  facilityName?: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  facilityType?: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  city?: string;

  @Validate(IsTimeZone)
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional({
    description: 'Inactive facilities are hidden from pickers and imports',
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

// --------------------------------------------------------------- departments

export class CreateDepartmentDto {
  @ApiProperty()
  @IsUUID()
  facilityId!: string;

  @ApiProperty({ example: 'ICU' })
  @IsString()
  @MaxLength(30)
  @Matches(CODE, { message: CODE_MESSAGE })
  departmentCode!: string;

  @ApiProperty({ example: 'Intensive Care Unit' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  departmentName!: string;

  @IsString()
  @MaxLength(50)
  @IsOptional()
  costCenter?: string;
}

export class UpdateDepartmentDto {
  @IsString()
  @MaxLength(30)
  @Matches(CODE, { message: CODE_MESSAGE })
  @IsOptional()
  departmentCode?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @IsOptional()
  departmentName?: string;

  @IsString()
  @MaxLength(50)
  @IsOptional()
  costCenter?: string;
}

// ----------------------------------------------------------------- locations

export class CreateBuildingDto {
  @IsUUID()
  facilityId!: string;

  @IsString()
  @MaxLength(30)
  @Matches(CODE, { message: CODE_MESSAGE })
  buildingCode!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  buildingName!: string;
}

export class UpdateBuildingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  buildingName!: string;
}

export class CreateFloorDto {
  @IsUUID()
  buildingId!: string;

  @ApiProperty({
    description: 'Ground = 0; basements are negative',
    example: 2,
  })
  @IsInt()
  @Min(-10)
  @Max(200)
  floorNumber!: number;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  floorName?: string;
}

export class UpdateFloorDto {
  @IsString()
  @MaxLength(100)
  floorName!: string;
}

export class CreateRoomDto {
  @IsUUID()
  floorId!: string;

  @IsString()
  @MaxLength(30)
  @Matches(CODE, { message: CODE_MESSAGE })
  roomCode!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  roomName!: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  roomType?: string;
}

export class UpdateRoomDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @IsOptional()
  roomName?: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  roomType?: string;
}

// --------------------------------------------------------------------- users

export class CreateUserDto {
  @ApiProperty({ example: 'nia.nurse@citygeneral.example' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({ enum: ALL_ROLES })
  @IsIn(ALL_ROLES)
  role!: Role;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  jobTitle?: string;

  @IsUUID()
  @IsOptional()
  facilityId?: string;

  @IsUUID()
  @IsOptional()
  departmentId?: string;
}

export class UpdateUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @IsOptional()
  lastName?: string;

  @ApiPropertyOptional({ enum: ALL_ROLES })
  @IsIn(ALL_ROLES)
  @IsOptional()
  role?: Role;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  jobTitle?: string;

  @IsUUID()
  @IsOptional()
  facilityId?: string;

  @IsUUID()
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({
    description: 'Deactivating signs the person out everywhere',
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
