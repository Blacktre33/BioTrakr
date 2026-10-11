import { Injectable, Logger } from '@nestjs/common';

import { RETIRED_STATUSES } from '../assets/asset-status.service';
import { ASSET_EDITOR_ROLES } from '../auth/roles';
import { PrismaService } from '../database/prisma.service';
import { deviceLabel, notify, type NotifyInput } from '../notifications/notify';
import {
  CONTRACT_NOTICE_DAYS,
  DAY,
  daysUntil,
  describeEnd,
  endOfDay,
  formatDate,
  NOTICE_GRACE_DAYS,
  noticeThreshold,
  startOfDay,
  WARRANTY_NOTICE_DAYS,
} from './contract-status';

const NAMED_IN_NOTICE = 5;
const BATCH = 500;

/**
 * Tells the people who manage contracts (admins and biomedical engineers)
 * as a contract or a device's warranty nears its end: 90, 60, 30 and 7 days
 * ahead and on the day for contracts, 90 and 30 days ahead and on the day
 * for warranties. NHSRC advises starting AMC/CMC renewal three months
 * before expiry. Each notice goes out once; a renewed contract, and a
 * warranty followed by a contract, need no notice.
 */
@Injectable()
export class ContractAlertsService {
  private readonly logger = new Logger('ContractAlerts');

  constructor(private readonly prisma: PrismaService) {}

  async check(
    now = new Date(),
  ): Promise<{ contracts: number; warranties: number }> {
    const contracts = await this.contracts(now);
    const warranties = await this.warranties(now);
    if (contracts || warranties) {
      this.logger.log(
        `Sent ${contracts} contract and ${warranties} warranty notice(s)`,
      );
    }
    return { contracts, warranties };
  }

  private window(now: Date) {
    const longest = Math.max(...CONTRACT_NOTICE_DAYS, ...WARRANTY_NOTICE_DAYS);
    return {
      gte: new Date(startOfDay(now).getTime() - NOTICE_GRACE_DAYS * DAY),
      lte: endOfDay(new Date(now.getTime() + longest * DAY)),
    };
  }

  private async contracts(now: Date): Promise<number> {
    const ending = await this.prisma.serviceContract.findMany({
      where: {
        terminatedAt: null,
        renewedBy: { is: null },
        endDate: this.window(now),
      },
      select: {
        id: true,
        organizationId: true,
        contractType: true,
        contractNumber: true,
        endDate: true,
        vendor: { select: { vendorName: true } },
        devices: {
          select: {
            asset: { select: { assetTagNumber: true, equipmentName: true } },
          },
        },
      },
      orderBy: { endDate: 'asc' },
      take: BATCH,
    });
    let sent = 0;
    for (const c of ending) {
      const daysLeft = daysUntil(c.endDate, now);
      const threshold = noticeThreshold(daysLeft, CONTRACT_NOTICE_DAYS);
      if (threshold === null) continue;
      const names = c.devices
        .slice(0, NAMED_IN_NOTICE)
        .map((d) => deviceLabel(d.asset));
      const more = c.devices.length - names.length;
      if (
        await this.send({
          organizationId: c.organizationId,
          kind: 'contract_expiring',
          severity: daysLeft <= 30 ? 'warning' : 'info',
          title: `${c.contractType} with ${c.vendor.vendorName} ${describeEnd(daysLeft)}`,
          body: [
            `Contract ${c.contractNumber}, last day ${formatDate(c.endDate)}.`,
            ...names,
            more > 0 ? `and ${more} more` : null,
            daysLeft >= 0
              ? 'Start the renewal now if it is not under way.'
              : 'These devices have no contract cover until it is renewed.',
          ]
            .filter(Boolean)
            .join('\n'),
          link: `/contracts?id=${c.id}`,
          to: { roles: ASSET_EDITOR_ROLES },
          dedupeKey: `contract-expiry:${c.id}:${threshold}`,
        })
      ) {
        sent++;
      }
    }
    return sent;
  }

  private async warranties(now: Date): Promise<number> {
    const devices = await this.prisma.asset.findMany({
      where: {
        deletedAt: null,
        assetStatus: { notIn: RETIRED_STATUSES },
        warrantyEndDate: this.window(now),
      },
      select: {
        id: true,
        organizationId: true,
        currentFacilityId: true,
        assetTagNumber: true,
        equipmentName: true,
        warrantyEndDate: true,
        serviceContracts: {
          select: {
            contract: { select: { endDate: true, terminatedAt: true } },
          },
        },
      },
      orderBy: { warrantyEndDate: 'asc' },
      take: BATCH,
    });
    let sent = 0;
    for (const d of devices) {
      const end = d.warrantyEndDate!;
      // A contract already arranged to carry on after the warranty.
      const followed = d.serviceContracts.some(
        ({ contract }) => !contract.terminatedAt && contract.endDate > end,
      );
      if (followed) continue;
      const daysLeft = daysUntil(end, now);
      const threshold = noticeThreshold(daysLeft, WARRANTY_NOTICE_DAYS);
      if (threshold === null) continue;
      if (
        await this.send({
          organizationId: d.organizationId,
          kind: 'warranty_expiring',
          severity: daysLeft <= 30 ? 'warning' : 'info',
          title: `Warranty ${describeEnd(daysLeft)}: ${deviceLabel(d)}`,
          body:
            daysLeft >= 0
              ? `Last day ${formatDate(end)}. Arrange a CMC or AMC so the device stays covered.`
              : `Ended ${formatDate(end)}. The device has no warranty or contract cover.`,
          link: `/assets/${d.id}`,
          assetId: d.id,
          to: { roles: ASSET_EDITOR_ROLES, facilityId: d.currentFacilityId },
          // The date is part of the key: a corrected date gets its own notices.
          dedupeKey: `warranty-expiry:${d.id}:${startOfDay(end).getTime()}:${threshold}`,
        })
      ) {
        sent++;
      }
    }
    return sent;
  }

  /**
   * Records a notice unless it went out on an earlier run. A failure is
   * logged and skipped, so one bad notice does not stop the rest.
   */
  private async send(
    input: NotifyInput & { dedupeKey: string },
  ): Promise<boolean> {
    try {
      const already = await this.prisma.notification.count({
        where: {
          organizationId: input.organizationId,
          dedupeKey: input.dedupeKey,
        },
      });
      if (already) return false;
      return (await this.prisma.$transaction((tx) => notify(tx, input))) > 0;
    } catch (error) {
      this.logger.error(
        `Could not record a notice: ${(error as Error).message}`,
      );
      return false;
    }
  }
}
