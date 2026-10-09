import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomInt } from 'crypto';

import { hashPassword } from '@biotrakr/utils';

import type { AuthUser } from '../auth/auth-user';
import { normalizeRole } from '../auth/roles';
import { PrismaService } from '../database/prisma.service';
import { codeKey } from '../pipeline/ingestion/excel-import.rules';
import type {
  CreateBuildingDto,
  CreateDepartmentDto,
  CreateFacilityDto,
  CreateFloorDto,
  CreateRoomDto,
  CreateUserDto,
  UpdateBuildingDto,
  UpdateDepartmentDto,
  UpdateFacilityDto,
  UpdateFloorDto,
  UpdateRoomDto,
  UpdateUserDto,
} from './admin.dto';

/** No look-alike characters (0/O, 1/l/I), so it can be read out or copied by hand. */
const PASSWORD_ALPHABET =
  'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

export function temporaryPassword(length = 14): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  }
  return out;
}

const isUniqueViolation = (e: unknown) =>
  (e as { code?: string }).code === 'P2002';

/** Turns a unique-key clash into a 409 the person can act on. */
async function unique<T>(write: Promise<T>, message: string): Promise<T> {
  try {
    return await write;
  } catch (e) {
    if (isUniqueViolation(e)) throw new ConflictException(message);
    throw e;
  }
}

const USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  jobTitle: true,
  facilityId: true,
  departmentId: true,
  isActive: true,
  lastLoginAt: true,
  passwordChangeRequired: true,
  accountLockedUntil: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

/**
 * Setting up a hospital: facilities, departments, buildings, floors, rooms
 * and people. Everything is scoped to the administrator's organization;
 * a parent from another organization is "not found". Nothing here deletes
 * records that devices or history point to: facilities are deactivated,
 * people are deactivated, and the rest can be renamed.
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------ locations

  /** The whole location tree, for the setup screens. */
  async locations(user: AuthUser) {
    return this.prisma.facility.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { facilityName: 'asc' },
      select: {
        id: true,
        facilityCode: true,
        facilityName: true,
        facilityType: true,
        city: true,
        timezone: true,
        isActive: true,
        departments: {
          orderBy: { departmentName: 'asc' },
          select: {
            id: true,
            departmentCode: true,
            departmentName: true,
            costCenter: true,
          },
        },
        buildings: {
          orderBy: { buildingName: 'asc' },
          select: {
            id: true,
            buildingCode: true,
            buildingName: true,
            floors: {
              orderBy: { floorNumber: 'asc' },
              select: {
                id: true,
                floorNumber: true,
                floorName: true,
                rooms: {
                  orderBy: { roomCode: 'asc' },
                  select: {
                    id: true,
                    roomCode: true,
                    roomName: true,
                    roomType: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async createFacility(dto: CreateFacilityDto, user: AuthUser) {
    await this.assertDistinctCode(
      dto.facilityCode,
      await this.prisma.facility.findMany({
        where: { organizationId: user.organizationId },
        select: { id: true, facilityCode: true },
      }),
      (f) => f.facilityCode,
      'facility',
    );
    return unique(
      this.prisma.facility.create({
        data: {
          organizationId: user.organizationId,
          facilityCode: dto.facilityCode.trim(),
          facilityName: dto.facilityName.trim(),
          facilityType: dto.facilityType?.trim() || null,
          city: dto.city?.trim() || null,
          timezone: dto.timezone ?? 'Asia/Kolkata',
        },
      }),
      'A facility with this code already exists',
    );
  }

  async updateFacility(id: string, dto: UpdateFacilityDto, user: AuthUser) {
    if (dto.facilityCode !== undefined) {
      await this.assertDistinctCode(
        dto.facilityCode,
        await this.prisma.facility.findMany({
          where: { organizationId: user.organizationId, id: { not: id } },
          select: { id: true, facilityCode: true },
        }),
        (f) => f.facilityCode,
        'facility',
      );
    }
    const { count } = await unique(
      this.prisma.facility.updateMany({
        where: { id, organizationId: user.organizationId },
        data: dto,
      }),
      'A facility with this code already exists',
    );
    if (count === 0) throw new NotFoundException('Facility not found');
    return this.prisma.facility.findFirst({ where: { id } });
  }

  async createDepartment(dto: CreateDepartmentDto, user: AuthUser) {
    await this.assertFacility(dto.facilityId, user);
    await this.assertDistinctCode(
      dto.departmentCode,
      await this.prisma.department.findMany({
        where: { facilityId: dto.facilityId },
        select: { id: true, departmentCode: true },
      }),
      (d) => d.departmentCode,
      'department in this facility',
    );
    return unique(
      this.prisma.department.create({
        data: {
          facilityId: dto.facilityId,
          departmentCode: dto.departmentCode.trim(),
          departmentName: dto.departmentName.trim(),
          costCenter: dto.costCenter?.trim() || null,
        },
      }),
      'This facility already has a department with this code',
    );
  }

  async updateDepartment(id: string, dto: UpdateDepartmentDto, user: AuthUser) {
    if (dto.departmentCode !== undefined) {
      const current = await this.prisma.department.findFirst({
        where: { id, facility: { organizationId: user.organizationId } },
        select: { facilityId: true },
      });
      if (!current) throw new NotFoundException('Department not found');
      await this.assertDistinctCode(
        dto.departmentCode,
        await this.prisma.department.findMany({
          where: { facilityId: current.facilityId, id: { not: id } },
          select: { id: true, departmentCode: true },
        }),
        (d) => d.departmentCode,
        'department in this facility',
      );
    }
    const { count } = await unique(
      this.prisma.department.updateMany({
        where: { id, facility: { organizationId: user.organizationId } },
        data: dto,
      }),
      'This facility already has a department with this code',
    );
    if (count === 0) throw new NotFoundException('Department not found');
    return this.prisma.department.findFirst({ where: { id } });
  }

  async createBuilding(dto: CreateBuildingDto, user: AuthUser) {
    await this.assertFacility(dto.facilityId, user);
    return unique(
      this.prisma.building.create({
        data: {
          facilityId: dto.facilityId,
          buildingCode: dto.buildingCode.trim(),
          buildingName: dto.buildingName.trim(),
        },
      }),
      'This facility already has a building with this code',
    );
  }

  async updateBuilding(id: string, dto: UpdateBuildingDto, user: AuthUser) {
    const { count } = await this.prisma.building.updateMany({
      where: { id, facility: { organizationId: user.organizationId } },
      data: { buildingName: dto.buildingName.trim() },
    });
    if (count === 0) throw new NotFoundException('Building not found');
    return this.prisma.building.findFirst({ where: { id } });
  }

  async createFloor(dto: CreateFloorDto, user: AuthUser) {
    const building = await this.prisma.building.count({
      where: {
        id: dto.buildingId,
        facility: { organizationId: user.organizationId },
      },
    });
    if (!building) throw new NotFoundException('Building not found');
    return unique(
      this.prisma.floor.create({
        data: {
          buildingId: dto.buildingId,
          floorNumber: dto.floorNumber,
          floorName: dto.floorName?.trim() || null,
        },
      }),
      'This building already has that floor',
    );
  }

  async updateFloor(id: string, dto: UpdateFloorDto, user: AuthUser) {
    const { count } = await this.prisma.floor.updateMany({
      where: {
        id,
        building: { facility: { organizationId: user.organizationId } },
      },
      data: { floorName: dto.floorName.trim() || null },
    });
    if (count === 0) throw new NotFoundException('Floor not found');
    return this.prisma.floor.findFirst({ where: { id } });
  }

  async createRoom(dto: CreateRoomDto, user: AuthUser) {
    const floor = await this.prisma.floor.count({
      where: {
        id: dto.floorId,
        building: { facility: { organizationId: user.organizationId } },
      },
    });
    if (!floor) throw new NotFoundException('Floor not found');
    return unique(
      this.prisma.room.create({
        data: {
          floorId: dto.floorId,
          roomCode: dto.roomCode.trim(),
          roomName: dto.roomName.trim(),
          roomType: dto.roomType?.trim() || null,
        },
      }),
      'This floor already has a room with this code',
    );
  }

  async updateRoom(id: string, dto: UpdateRoomDto, user: AuthUser) {
    const { count } = await this.prisma.room.updateMany({
      where: {
        id,
        floor: {
          building: { facility: { organizationId: user.organizationId } },
        },
      },
      data: dto,
    });
    if (count === 0) throw new NotFoundException('Room not found');
    return this.prisma.room.findFirst({ where: { id } });
  }

  // ---------------------------------------------------------------- users

  async users(user: AuthUser) {
    return this.prisma.user.findMany({
      where: { organizationId: user.organizationId },
      orderBy: [
        { isActive: 'desc' },
        { firstName: 'asc' },
        { lastName: 'asc' },
      ],
      select: USER_SELECT,
      take: 2000,
    });
  }

  /**
   * Creates an account with a one-time password, shown to the
   * administrator once (it is not stored, only its hash). The person must
   * choose their own password when they first sign in.
   */
  async createUser(dto: CreateUserDto, user: AuthUser) {
    const facilityId = await this.assertPlacement(
      dto.facilityId,
      dto.departmentId,
      user,
    );
    const email = dto.email.trim().toLowerCase();
    // Sign-in matches email without case, so "Bob@x" and "bob@x" must not both exist.
    const taken = await this.prisma.user.count({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (taken) {
      throw new ConflictException('An account with this email already exists');
    }
    const password = temporaryPassword();
    const created = await unique(
      this.prisma.user.create({
        data: {
          organizationId: user.organizationId,
          email,
          username: email,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          role: dto.role,
          jobTitle: dto.jobTitle?.trim() || null,
          facilityId,
          departmentId: dto.departmentId ?? null,
          passwordHash: await hashPassword(password),
          passwordChangeRequired: true,
        },
        select: USER_SELECT,
      }),
      'An account with this email already exists',
    );
    return { user: created, temporaryPassword: password };
  }

  async updateUser(id: string, dto: UpdateUserDto, admin: AuthUser) {
    const target = await this.prisma.user.findFirst({
      where: { id, organizationId: admin.organizationId },
      select: {
        id: true,
        role: true,
        isActive: true,
        facilityId: true,
        departmentId: true,
      },
    });
    if (!target) throw new NotFoundException('Person not found');

    const losingAdmin =
      target.isActive &&
      normalizeRole(target.role) === 'admin' &&
      ((dto.role !== undefined && dto.role !== 'admin') ||
        dto.isActive === false);
    if (id === admin.userId && losingAdmin) {
      throw new BadRequestException(
        'You cannot remove your own administrator access. Ask another administrator.',
      );
    }
    const placement = await this.resolvePlacement(target, dto, admin);

    const data: Prisma.UserUncheckedUpdateInput = {
      ...(dto.firstName !== undefined
        ? { firstName: dto.firstName.trim() }
        : {}),
      ...(dto.lastName !== undefined ? { lastName: dto.lastName.trim() } : {}),
      ...(dto.jobTitle !== undefined
        ? { jobTitle: dto.jobTitle.trim() || null }
        : {}),
      ...(dto.role !== undefined ? { role: dto.role } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      ...placement,
    };

    const updated = await this.prisma.$transaction(async (tx) => {
      // Two administrators demoting each other at once must not leave none:
      // changes to an organization's admins take turns, and the count is
      // checked after the change, before it commits.
      if (losingAdmin) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'admins:' + admin.organizationId}))`;
      }
      const row = await tx.user.update({
        where: { id },
        data,
        select: USER_SELECT,
      });
      if (losingAdmin) {
        const admins = await tx.user.count({
          where: {
            organizationId: admin.organizationId,
            isActive: true,
            role: { equals: 'admin', mode: 'insensitive' },
          },
        });
        if (admins < 1) {
          throw new BadRequestException(
            'The organization must keep at least one active administrator',
          );
        }
      }
      // A changed role or a deactivated account takes effect on every
      // device at its next refresh (within the 15-minute access token).
      if (
        dto.isActive === false ||
        (dto.role && dto.role !== normalizeRole(target.role))
      ) {
        await tx.authSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date(), revokedReason: 'account_changed' },
        });
      }
      return row;
    });
    return updated;
  }

  /** New one-time password; signs the person out everywhere and unlocks the account. */
  async resetPassword(id: string, admin: AuthUser) {
    const target = await this.prisma.user.findFirst({
      where: { id, organizationId: admin.organizationId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Person not found');
    const password = temporaryPassword();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: {
          passwordHash: await hashPassword(password),
          passwordChangeRequired: true,
          failedLoginAttempts: 0,
          accountLockedUntil: null,
        },
      }),
      this.prisma.authSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'password_reset' },
      }),
    ]);
    return { temporaryPassword: password };
  }

  // -------------------------------------------------------------- helpers

  /**
   * Imports match codes loosely ("C-G" finds "CG"), so codes that differ
   * only in case or punctuation would be confused. Refuse them up front.
   */
  private async assertDistinctCode<T>(
    code: string,
    siblings: T[],
    codeOf: (item: T) => string,
    what: string,
  ) {
    const clash = siblings.find(
      (s) => codeKey(codeOf(s)) === codeKey(code.trim()),
    );
    if (clash) {
      throw new ConflictException(
        `Too similar to the existing ${what} code "${codeOf(clash)}". Codes must differ by more than case or punctuation.`,
      );
    }
  }

  private async assertFacility(facilityId: string, user: AuthUser) {
    const n = await this.prisma.facility.count({
      where: { id: facilityId, organizationId: user.organizationId },
    });
    if (!n) throw new NotFoundException('Facility not found');
  }

  /**
   * Where a person ends up after an edit, kept consistent: clearing the
   * facility clears the department; a new facility drops a department that
   * is not in it; a department on its own moves them to its facility.
   */
  private async resolvePlacement(
    current: { facilityId: string | null; departmentId: string | null },
    dto: UpdateUserDto,
    admin: AuthUser,
  ): Promise<{ facilityId?: string | null; departmentId?: string | null }> {
    if (dto.facilityId === undefined && dto.departmentId === undefined) {
      return {};
    }
    if (dto.facilityId === null) {
      if (dto.departmentId) {
        throw new BadRequestException(
          'A department needs a facility: choose the facility too',
        );
      }
      return { facilityId: null, departmentId: null };
    }
    if (dto.departmentId === null) {
      if (dto.facilityId) await this.assertFacility(dto.facilityId, admin);
      return {
        ...(dto.facilityId ? { facilityId: dto.facilityId } : {}),
        departmentId: null,
      };
    }
    if (dto.departmentId) {
      const dept = await this.prisma.department.findFirst({
        where: {
          id: dto.departmentId,
          facility: { organizationId: admin.organizationId },
        },
        select: { facilityId: true },
      });
      if (!dept) throw new NotFoundException('Department not found');
      if (dto.facilityId && dept.facilityId !== dto.facilityId) {
        throw new BadRequestException(
          'The department is not in the selected facility',
        );
      }
      return { facilityId: dept.facilityId, departmentId: dto.departmentId };
    }
    // New facility only.
    await this.assertFacility(dto.facilityId!, admin);
    let keepDepartment = false;
    if (current.departmentId) {
      keepDepartment =
        (await this.prisma.department.count({
          where: { id: current.departmentId, facilityId: dto.facilityId! },
        })) > 0;
    }
    return {
      facilityId: dto.facilityId!,
      ...(keepDepartment ? {} : { departmentId: null }),
    };
  }

  /** A person's facility and department must be in the organization, and the department in the facility. */
  private async assertPlacement(
    facilityId: string | undefined,
    departmentId: string | undefined,
    user: AuthUser,
  ): Promise<string | null> {
    if (facilityId) await this.assertFacility(facilityId, user);
    if (!departmentId) return facilityId ?? null;
    const dept = await this.prisma.department.findFirst({
      where: {
        id: departmentId,
        facility: { organizationId: user.organizationId },
      },
      select: { facilityId: true },
    });
    if (!dept) throw new NotFoundException('Department not found');
    if (facilityId && dept.facilityId !== facilityId) {
      throw new BadRequestException(
        'The department is not in the selected facility',
      );
    }
    // A department alone places the person in its facility.
    return dept.facilityId;
  }
}
