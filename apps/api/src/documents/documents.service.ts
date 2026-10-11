import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { DocumentCategory, Prisma } from '@prisma/client';
import { createHash } from 'crypto';

import type { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';
import type {
  DocumentTarget,
  ListDocumentsQuery,
  UploadDocumentDto,
  WithdrawDocumentDto,
} from './documents.dto';
import {
  cleanFileName,
  sniffDocumentType,
  titleFromFileName,
} from './file-type';

/** What multer hands over for one uploaded file (kept in memory). */
export interface UploadedFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

const name = (u: { firstName: string; lastName: string }) =>
  `${u.firstName} ${u.lastName}`.trim();

/** Everything but the content. */
const META_SELECT = {
  id: true,
  assetId: true,
  calibrationRecordId: true,
  safetyTestRecordId: true,
  contractId: true,
  workOrderId: true,
  category: true,
  title: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  sha256: true,
  uploadedAt: true,
  uploadedBy: { select: { firstName: true, lastName: true } },
  withdrawal: {
    select: {
      reason: true,
      withdrawnAt: true,
      withdrawnBy: { select: { firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.DocumentSelect;

type Meta = Prisma.DocumentGetPayload<{ select: typeof META_SELECT }>;

const present = ({ uploadedBy, withdrawal, ...doc }: Meta) => ({
  ...doc,
  uploadedBy: name(uploadedBy),
  withdrawal: withdrawal
    ? {
        reason: withdrawal.reason,
        withdrawnAt: withdrawal.withdrawnAt,
        withdrawnBy: name(withdrawal.withdrawnBy),
      }
    : null,
});

/** The kind of file each record usually gets. */
const DEFAULT_CATEGORY: Record<DocumentTarget, DocumentCategory> = {
  asset: 'OTHER',
  calibration: 'CALIBRATION_CERTIFICATE',
  safetyTest: 'SAFETY_TEST_REPORT',
  contract: 'CONTRACT',
  workOrder: 'SERVICE_REPORT',
};

type Link = Pick<
  Prisma.DocumentUncheckedCreateInput,
  | 'assetId'
  | 'calibrationRecordId'
  | 'safetyTestRecordId'
  | 'contractId'
  | 'workOrderId'
>;

/** How many files (not withdrawn) each record has, for "certificate on file". */
export async function documentCounts(
  prisma: Pick<PrismaService, 'document'>,
  field: 'calibrationRecordId' | 'safetyTestRecordId' | 'contractId',
  ids: string[],
): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.document.groupBy({
    by: [field],
    where: { [field]: { in: ids }, withdrawal: { is: null } },
    _count: { _all: true },
  });
  return new Map(
    rows.map((r) => [r[field] as string, r._count._all] as [string, number]),
  );
}

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Files attached to a record, newest first. For a device: every file
   * about it, its calibration certificates and service reports included.
   */
  async list(query: ListDocumentsQuery, user: AuthUser) {
    const link = await this.resolve(query.targetType, query.targetId, user);
    const where: Prisma.DocumentWhereInput =
      query.targetType === 'asset'
        ? { assetId: link.assetId }
        : query.targetType === 'contract'
          ? { contractId: link.contractId }
          : query.targetType === 'calibration'
            ? { calibrationRecordId: link.calibrationRecordId }
            : query.targetType === 'safetyTest'
              ? { safetyTestRecordId: link.safetyTestRecordId }
              : { workOrderId: link.workOrderId };
    const rows = await this.prisma.document.findMany({
      where: { ...where, organizationId: user.organizationId },
      orderBy: [{ uploadedAt: 'desc' }, { id: 'asc' }],
      take: 200,
      select: META_SELECT,
    });
    return rows.map(present);
  }

  async upload(
    file: UploadedFile | undefined,
    dto: UploadDocumentDto,
    user: AuthUser,
  ) {
    if (!file) throw new BadRequestException('Choose a file to upload');
    if (file.size === 0) throw new BadRequestException('The file is empty');
    const mimeType = sniffDocumentType(file.buffer);
    if (!mimeType) {
      throw new BadRequestException('Upload a PDF, JPEG or PNG file');
    }
    const link = await this.resolve(dto.targetType, dto.targetId, user);
    const fileName = cleanFileName(file.originalname);
    const created = await this.prisma.document.create({
      data: {
        ...link,
        organizationId: user.organizationId,
        category: dto.category ?? DEFAULT_CATEGORY[dto.targetType],
        title: dto.title?.trim() || titleFromFileName(fileName),
        fileName,
        mimeType,
        sizeBytes: file.size,
        sha256: createHash('sha256').update(file.buffer).digest('hex'),
        content: file.buffer,
        uploadedById: user.userId,
      },
      select: META_SELECT,
    });
    return present(created);
  }

  /** The file itself, for download. */
  async content(id: string, user: AuthUser) {
    const doc = await this.prisma.document.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { fileName: true, mimeType: true, content: true },
    });
    if (!doc) throw new NotFoundException('File not found');
    return doc;
  }

  /** Takes a file back. It stays on record, marked, with the reason. */
  async withdraw(id: string, dto: WithdrawDocumentDto, user: AuthUser) {
    const doc = await this.prisma.document.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, withdrawal: { select: { documentId: true } } },
    });
    if (!doc) throw new NotFoundException('File not found');
    if (doc.withdrawal) {
      throw new ConflictException('This file has already been withdrawn');
    }
    try {
      await this.prisma.documentWithdrawal.create({
        data: {
          documentId: id,
          reason: dto.reason,
          withdrawnById: user.userId,
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException('This file has already been withdrawn');
      }
      throw error;
    }
    const updated = await this.prisma.document.findFirst({
      where: { id },
      select: META_SELECT,
    });
    return present(updated!);
  }

  /** The record a file is for, checked to be this hospital's. */
  private async resolve(
    type: DocumentTarget,
    id: string,
    user: AuthUser,
  ): Promise<Link> {
    const inOrg = { organizationId: user.organizationId };
    let link: Link | null = null;
    switch (type) {
      case 'asset': {
        const a = await this.prisma.asset.findFirst({
          where: { id, ...inOrg, deletedAt: null },
          select: { id: true },
        });
        link = a && { assetId: a.id };
        break;
      }
      case 'calibration': {
        const r = await this.prisma.calibrationRecord.findFirst({
          where: { id, asset: inOrg },
          select: { assetId: true },
        });
        link = r && { assetId: r.assetId, calibrationRecordId: id };
        break;
      }
      case 'safetyTest': {
        const r = await this.prisma.safetyTestRecord.findFirst({
          where: { id, asset: inOrg },
          select: { assetId: true },
        });
        link = r && { assetId: r.assetId, safetyTestRecordId: id };
        break;
      }
      case 'contract': {
        const c = await this.prisma.serviceContract.findFirst({
          where: { id, ...inOrg },
          select: { id: true },
        });
        // Not tied to one device: a contract can cover several.
        link = c && { assetId: null, contractId: id };
        break;
      }
      case 'workOrder': {
        const w = await this.prisma.maintenanceHistory.findFirst({
          where: { id, asset: inOrg },
          select: { assetId: true },
        });
        link = w && { assetId: w.assetId, workOrderId: id };
        break;
      }
    }
    if (!link) throw new NotFoundException('Not found');
    return link;
  }
}
