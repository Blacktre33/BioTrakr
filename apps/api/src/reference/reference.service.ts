import { Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import { ASSET_FORM_ENUMS, type FormOption } from './asset-form-options';

/** Upper bound on each picker list, so one response stays small. */
export const MAX_PICKER_ITEMS = 2000;

export interface AssetFormReference {
  enums: Record<keyof typeof ASSET_FORM_ENUMS, FormOption[]>;
  facilities: Array<{ id: string; name: string; code: string }>;
  departments: Array<{ id: string; name: string; facilityId: string }>;
  custodians: Array<{
    id: string;
    name: string;
    jobTitle: string | null;
    facilityId: string | null;
    departmentId: string | null;
  }>;
}

@Injectable()
export class ReferenceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Everything the asset form needs to offer choices instead of free text. */
  async getAssetFormReference(
    organizationId: string,
  ): Promise<AssetFormReference> {
    const [facilities, departments, users] = await Promise.all([
      this.prisma.facility.findMany({
        where: { organizationId, isActive: true },
        select: { id: true, facilityName: true, facilityCode: true },
        orderBy: { facilityName: 'asc' },
        take: MAX_PICKER_ITEMS,
      }),
      this.prisma.department.findMany({
        where: { facility: { organizationId, isActive: true } },
        select: { id: true, departmentName: true, facilityId: true },
        orderBy: { departmentName: 'asc' },
        take: MAX_PICKER_ITEMS,
      }),
      this.prisma.user.findMany({
        where: { organizationId, isActive: true },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          jobTitle: true,
          facilityId: true,
          departmentId: true,
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        take: MAX_PICKER_ITEMS,
      }),
    ]);

    return {
      enums: ASSET_FORM_ENUMS,
      facilities: facilities.map((f) => ({
        id: f.id,
        name: f.facilityName,
        code: f.facilityCode,
      })),
      departments: departments.map((d) => ({
        id: d.id,
        name: d.departmentName,
        facilityId: d.facilityId,
      })),
      custodians: users.map((u) => ({
        id: u.id,
        name: `${u.firstName} ${u.lastName}`.trim(),
        jobTitle: u.jobTitle,
        facilityId: u.facilityId,
        departmentId: u.departmentId,
      })),
    };
  }
}
