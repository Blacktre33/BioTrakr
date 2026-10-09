import { BadRequestException, Injectable } from '@nestjs/common';

import type { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';

/** Notices older than this drop out of the list (they stay in the table). */
const KEEP_DAYS = 30;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: { take?: number; unreadOnly?: boolean }, user: AuthUser) {
    const since = new Date(Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000);
    const mine = {
      userId: user.userId,
      organizationId: user.organizationId,
      createdAt: { gte: since },
    };
    const [unread, items] = await Promise.all([
      this.prisma.notification.count({ where: { ...mine, readAt: null } }),
      this.prisma.notification.findMany({
        where: { ...mine, ...(query.unreadOnly ? { readAt: null } : {}) },
        // Unread first, so they come before anything already read.
        orderBy: [
          { readAt: { sort: 'asc', nulls: 'first' } },
          { createdAt: 'desc' },
        ],
        take: query.take ?? 20,
        select: {
          id: true,
          kind: true,
          severity: true,
          title: true,
          body: true,
          link: true,
          assetId: true,
          workOrderId: true,
          createdAt: true,
          readAt: true,
        },
      }),
    ]);
    return { unread, items };
  }

  async markRead(body: { ids?: string[]; all?: boolean }, user: AuthUser) {
    if (!body.all && !body.ids?.length) {
      throw new BadRequestException('Say which notifications to mark read');
    }
    const { count } = await this.prisma.notification.updateMany({
      where: {
        userId: user.userId,
        organizationId: user.organizationId,
        readAt: null,
        ...(body.all ? {} : { id: { in: body.ids } }),
      },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }
}
