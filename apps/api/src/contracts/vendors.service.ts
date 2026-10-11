import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';
import type { UpdateVendorDto, VendorInputDto } from './contracts.dto';

export const VENDOR_SELECT = {
  id: true,
  vendorName: true,
  vendorType: true,
  contactPerson: true,
  phone: true,
  email: true,
  address: true,
} satisfies Prisma.VendorSelect;

const blankToNull = (v: string | undefined) =>
  v === undefined ? undefined : v.trim() || null;

@Injectable()
export class VendorsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The hospital's vendors, by name, with how many contracts each has. */
  async list(user: AuthUser) {
    const vendors = await this.prisma.vendor.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { vendorName: 'asc' },
      take: 1000,
      select: VENDOR_SELECT,
    });
    const counts = await this.prisma.serviceContract.groupBy({
      by: ['vendorId'],
      where: { organizationId: user.organizationId },
      _count: { _all: true },
    });
    const byVendor = new Map(counts.map((c) => [c.vendorId, c._count._all]));
    return vendors.map((v) => ({ ...v, contracts: byVendor.get(v.id) ?? 0 }));
  }

  async create(dto: VendorInputDto, user: AuthUser) {
    await this.assertNameFree(dto.vendorName, user.organizationId);
    try {
      return await this.prisma.vendor.create({
        data: {
          organizationId: user.organizationId,
          vendorName: dto.vendorName,
          vendorType: dto.vendorType,
          contactPerson: blankToNull(dto.contactPerson),
          phone: blankToNull(dto.phone),
          email: blankToNull(dto.email),
          address: blankToNull(dto.address),
        },
        select: VENDOR_SELECT,
      });
    } catch (error) {
      throw this.duplicate(error);
    }
  }

  async update(id: string, dto: UpdateVendorDto, user: AuthUser) {
    if (dto.vendorName) {
      await this.assertNameFree(dto.vendorName, user.organizationId, id);
    }
    try {
      const { count } = await this.prisma.vendor.updateMany({
        where: { id, organizationId: user.organizationId },
        data: {
          vendorName: dto.vendorName,
          vendorType: dto.vendorType,
          contactPerson: blankToNull(dto.contactPerson),
          phone: blankToNull(dto.phone),
          email: blankToNull(dto.email),
          address: blankToNull(dto.address),
        },
      });
      if (count === 0) throw new NotFoundException('Vendor not found');
    } catch (error) {
      throw this.duplicate(error);
    }
    return this.prisma.vendor.findFirst({
      where: { id, organizationId: user.organizationId },
      select: VENDOR_SELECT,
    });
  }

  /** "Philips" and "philips" are the same vendor. */
  private async assertNameFree(
    name: string,
    organizationId: string,
    exceptId?: string,
  ) {
    const same = await this.prisma.vendor.findFirst({
      where: {
        organizationId,
        vendorName: { equals: name.trim(), mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (same) {
      throw new ConflictException('A vendor with this name already exists');
    }
  }

  private duplicate(error: unknown) {
    return (error as { code?: string }).code === 'P2002'
      ? new ConflictException('A vendor with this name already exists')
      : error;
  }
}
