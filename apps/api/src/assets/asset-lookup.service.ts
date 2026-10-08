import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AssetStatus, RecallStatus } from '@prisma/client';

import type { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const MAX_CODE_LENGTH = 500;

export type ScanCode =
  | { kind: 'id'; id: string }
  | { kind: 'tag'; tag: string };

/**
 * Works out which asset a scanned or typed code refers to. Accepts:
 * - a tag number as printed on the label (barcode or typed),
 * - an asset id, or a QR payload such as biotrakr://asset/<id>,
 * - a link to the scan page (…/scan?code=<tag or id>), so a phone's own
 *   camera app can open the device straight from its label.
 */
export function parseScanCode(raw: string | undefined): ScanCode {
  // Drop control characters some barcode scanners append (e.g. GS, CR).
  // eslint-disable-next-line no-control-regex
  const code = (raw ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!code) {
    throw new BadRequestException('Scan a tag or type its number');
  }
  if (code.length > MAX_CODE_LENGTH) {
    throw new BadRequestException('That code is too long to be an asset tag');
  }

  let url: URL | null = null;
  try {
    url = new URL(code);
  } catch {
    // Not a URL: a plain tag number or id.
  }
  if (url && /^(https?|biotrakr):$/.test(url.protocol)) {
    const nested = url.searchParams.get('code');
    if (nested && nested !== code) return parseScanCode(nested);
    const id = `${url.hostname}${url.pathname}`.match(UUID);
    if (id) return { kind: 'id', id: id[0].toLowerCase() };
    throw new BadRequestException('This QR code is not a BioTrakr asset label');
  }

  const id = code.match(UUID);
  if (id && id[0].length === code.length) {
    return { kind: 'id', id: id[0].toLowerCase() };
  }
  return { kind: 'tag', tag: code };
}

export interface AssetAlert {
  /** stop: do not use the device. caution: usable, but someone should act. */
  level: 'stop' | 'caution';
  message: string;
}

const STATUS_ALERTS: Partial<Record<AssetStatus, string>> = {
  QUARANTINED: 'Quarantined. Do not use on patients.',
  IN_MAINTENANCE:
    'With biomedical engineering. Do not use until it is released.',
  CONDEMNED: 'Condemned. Do not use.',
  RETIRED: 'Retired. Not for clinical use.',
  DISPOSED: 'Recorded as disposed. It should not be in use.',
};

const RECALL_LABEL: Record<Exclude<RecallStatus, 'NONE'>, string> = {
  CLASS_I: 'Class I',
  CLASS_II: 'Class II',
  CLASS_III: 'Class III',
};

/** What staff need to know before using a device, most serious first. */
export function assetAlerts(
  asset: {
    assetStatus: AssetStatus;
    recallStatus: RecallStatus;
    nextPmDueDate: Date | null;
  },
  now: Date = new Date(),
): AssetAlert[] {
  const alerts: AssetAlert[] = [];
  const statusMessage = STATUS_ALERTS[asset.assetStatus];
  if (statusMessage) alerts.push({ level: 'stop', message: statusMessage });

  if (asset.recallStatus !== 'NONE') {
    alerts.push({
      // A Class I recall means a reasonable chance of serious harm.
      level: asset.recallStatus === 'CLASS_I' ? 'stop' : 'caution',
      message: `Under a ${RECALL_LABEL[asset.recallStatus]} recall. Check with biomedical engineering.`,
    });
  }

  if (asset.nextPmDueDate && asset.nextPmDueDate < now) {
    alerts.push({
      level: 'caution',
      message:
        'Preventive maintenance is overdue. Let biomedical engineering know.',
    });
  }

  return alerts.sort((a, b) =>
    a.level === b.level ? 0 : a.level === 'stop' ? -1 : 1,
  );
}

@Injectable()
export class AssetLookupService {
  constructor(private readonly prisma: PrismaService) {}

  /** The device behind a scanned code, with what staff need at the bedside. */
  async lookup(rawCode: string | undefined, user: AuthUser) {
    const code = parseScanCode(rawCode);
    // Up to two matches: tags are unique only case-sensitively in the
    // database, so "icu-v1" and "ICU-V1" could both exist.
    const matches = await this.prisma.asset.findMany({
      take: 2,
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        ...(code.kind === 'id'
          ? { id: code.id }
          : { assetTagNumber: { equals: code.tag, mode: 'insensitive' } }),
      },
      select: {
        id: true,
        assetTagNumber: true,
        equipmentName: true,
        manufacturer: true,
        modelNumber: true,
        serialNumber: true,
        deviceCategory: true,
        criticalityLevel: true,
        riskClassification: true,
        assetStatus: true,
        recallStatus: true,
        lastPmDate: true,
        nextPmDueDate: true,
        lastSeenTimestamp: true,
        currentFacility: { select: { facilityName: true } },
        currentRoom: { select: { roomName: true, roomCode: true } },
        custodianDepartment: { select: { departmentName: true } },
        maintenanceHistory: {
          take: 5,
          orderBy: { scheduledDate: 'desc' },
          select: {
            id: true,
            workOrderType: true,
            workOrderStatus: true,
            scheduledDate: true,
            completedAt: true,
            description: true,
          },
        },
        scanLogs: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            createdAt: true,
            notes: true,
            locationHint: true,
            scannedBy: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    const asset =
      code.kind === 'tag'
        ? (matches.find((m) => m.assetTagNumber === code.tag) ??
          (matches.length === 1 ? matches[0] : undefined))
        : matches[0];
    if (!asset && code.kind === 'tag' && matches.length > 1) {
      // Never pick one at random: the other might be the quarantined one.
      throw new ConflictException(
        `More than one device has a tag like "${code.tag}" (differing only in upper/lower case). Type the tag exactly as printed, and ask biomedical engineering to fix the duplicate.`,
      );
    }
    if (!asset) {
      throw new NotFoundException(
        code.kind === 'tag'
          ? `No device with tag "${code.tag}" in your organization. Check the label and try again.`
          : 'No device matches this code in your organization.',
      );
    }

    const alerts = assetAlerts(asset);
    const {
      currentFacility,
      currentRoom,
      custodianDepartment,
      scanLogs,
      maintenanceHistory,
      lastPmDate,
      nextPmDueDate,
      ...device
    } = asset;

    return {
      ...device,
      safeToUse: !alerts.some((a) => a.level === 'stop'),
      alerts,
      location: {
        facility: currentFacility?.facilityName ?? null,
        room: currentRoom
          ? `${currentRoom.roomName} (${currentRoom.roomCode})`
          : null,
      },
      department: custodianDepartment?.departmentName ?? null,
      pm: {
        lastPmDate,
        nextPmDueDate,
        overdue: Boolean(nextPmDueDate && nextPmDueDate < new Date()),
      },
      recentMaintenance: maintenanceHistory,
      recentScans: scanLogs.map(({ scannedBy, ...scan }) => ({
        ...scan,
        scannedBy: scannedBy
          ? `${scannedBy.firstName} ${scannedBy.lastName}`.trim()
          : null,
      })),
    };
  }
}

export type AssetLookupResult = Awaited<
  ReturnType<AssetLookupService['lookup']>
>;
