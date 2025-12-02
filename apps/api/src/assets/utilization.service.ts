import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  UtilizationSummaryDto,
  AssetUtilizationDto,
  CategoryUtilizationDto,
  DepartmentUtilizationDto,
  UtilizationTrendDto,
  IdleAssetDto,
  AssetUtilizationDetailsDto,
} from './dto/utilization.dto';

interface UtilizationFilters {
  startDate?: Date;
  endDate?: Date;
  category?: string;
  departmentId?: string;
  facilityId?: string;
}

@Injectable()
export class UtilizationService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(filters?: UtilizationFilters): Promise<UtilizationSummaryDto> {
    const { startDate, endDate } = this.getDateRange(filters);

    // Get all usage logs in the date range
    const usageLogs = await this.prisma.usageLog.findMany({
      where: {
        sessionStartTime: {
          gte: startDate,
          lte: endDate,
        },
        ...(filters?.departmentId && { departmentId: filters.departmentId }),
        ...(filters?.category && {
          asset: {
            deviceCategory: filters.category as any,
          },
        }),
        ...(filters?.facilityId && {
          asset: {
            currentFacilityId: filters.facilityId,
          },
        }),
      },
      include: {
        asset: {
          select: {
            id: true,
            deviceCategory: true,
          },
        },
      },
    });

    // Calculate total usage hours
    const totalUsageMinutes = usageLogs.reduce((sum, log) => {
      if (log.durationMinutes) {
        return sum + Number(log.durationMinutes);
      }
      // If durationMinutes is null, calculate from start/end times
      if (log.sessionEndTime) {
        const duration = (log.sessionEndTime.getTime() - log.sessionStartTime.getTime()) / (1000 * 60);
        return sum + duration;
      }
      return sum;
    }, 0);

    const totalUsageHours = totalUsageMinutes / 60;

    // Calculate available hours (time period * 24)
    const timeDiffMs = endDate.getTime() - startDate.getTime();
    const daysInPeriod = timeDiffMs / (1000 * 60 * 60 * 24);
    const availableHours = daysInPeriod * 24;

    // Get unique assets with usage
    const uniqueAssetIds = new Set(usageLogs.map((log) => log.assetId));
    const activeAssetsCount = uniqueAssetIds.size;

    // Get total assets count
    const totalAssetsCount = await this.prisma.asset.count({
      where: {
        deletedAt: null,
        assetStatus: { in: ['ACTIVE', 'IN_SERVICE'] },
        ...(filters?.category && { deviceCategory: filters.category as any }),
        ...(filters?.facilityId && { currentFacilityId: filters.facilityId }),
      },
    });

    // Calculate average utilization
    const averageUtilization = totalAssetsCount > 0
      ? (totalUsageHours / (availableHours * totalAssetsCount)) * 100
      : 0;

    // Calculate peak usage times
    const hourUsage: Record<number, number> = {};
    const dayUsage: Record<number, number> = {};

    usageLogs.forEach((log) => {
      const hour = log.sessionStartTime.getHours();
      const day = log.sessionStartTime.getDay();
      const duration = log.durationMinutes ? Number(log.durationMinutes) / 60 : 0.5;

      hourUsage[hour] = (hourUsage[hour] || 0) + duration;
      dayUsage[day] = (dayUsage[day] || 0) + duration;
    });

    const peakUtilizationHourEntry = Object.entries(hourUsage)
      .sort(([, a], [, b]) => b - a)[0];
    const peakUtilizationDayEntry = Object.entries(dayUsage)
      .sort(([, a], [, b]) => b - a)[0];

    const peakUtilizationHour = peakUtilizationHourEntry ? parseInt(peakUtilizationHourEntry[0], 10) : 0;
    const peakUtilizationDay = peakUtilizationDayEntry ? parseInt(peakUtilizationDayEntry[0], 10) : 0;

    // Calculate average session duration
    const validSessions = usageLogs.filter((log) => log.durationMinutes || log.sessionEndTime);
    const averageSessionDuration = validSessions.length > 0
      ? totalUsageMinutes / validSessions.length
      : 0;

    return {
      averageUtilization: Math.min(100, Math.round(averageUtilization * 100) / 100),
      totalUsageHours: Math.round(totalUsageHours * 100) / 100,
      activeAssetsCount,
      totalAssetsCount,
      peakUtilizationHour,
      peakUtilizationDay,
      totalSessions: usageLogs.length,
      averageSessionDuration: Math.round(averageSessionDuration * 100) / 100,
    };
  }

  async getByAsset(filters?: UtilizationFilters): Promise<AssetUtilizationDto[]> {
    const { startDate, endDate } = this.getDateRange(filters);

    // Get all assets with usage logs
    const assets = await this.prisma.asset.findMany({
      where: {
        deletedAt: null,
        assetStatus: { in: ['ACTIVE', 'IN_SERVICE'] },
        ...(filters?.category && { deviceCategory: filters.category as any }),
        ...(filters?.facilityId && { currentFacilityId: filters.facilityId }),
        usageLogs: {
          some: {
            sessionStartTime: {
              gte: startDate,
              lte: endDate,
            },
            ...(filters?.departmentId && { departmentId: filters.departmentId }),
          },
        },
      },
      include: {
        usageLogs: {
          where: {
            sessionStartTime: {
              gte: startDate,
              lte: endDate,
            },
            ...(filters?.departmentId && { departmentId: filters.departmentId }),
          },
          orderBy: {
            sessionStartTime: 'desc',
          },
        },
        custodianDepartment: {
          select: {
            departmentName: true,
          },
        },
      },
    });

    const timeDiffMs = endDate.getTime() - startDate.getTime();
    const daysInPeriod = timeDiffMs / (1000 * 60 * 60 * 24);
    const availableHours = daysInPeriod * 24;

    return assets.map((asset) => {
      const logs = asset.usageLogs;
      const totalMinutes = logs.reduce((sum, log) => {
        if (log.durationMinutes) {
          return sum + Number(log.durationMinutes);
        }
        if (log.sessionEndTime) {
          return sum + (log.sessionEndTime.getTime() - log.sessionStartTime.getTime()) / (1000 * 60);
        }
        return sum;
      }, 0);

      const usageHours = totalMinutes / 60;
      const utilizationPercentage = (usageHours / availableHours) * 100;

      const validSessions = logs.filter((log) => log.durationMinutes || log.sessionEndTime);
      const averageSessionDuration = validSessions.length > 0
        ? totalMinutes / validSessions.length
        : 0;

      const lastLog = logs[0];
      const lastUsedAt = lastLog?.sessionStartTime || null;
      const idleTimeHours = lastUsedAt
        ? (new Date().getTime() - lastUsedAt.getTime()) / (1000 * 60 * 60)
        : null;

      return {
        assetId: asset.id,
        assetTag: asset.assetTagNumber,
        equipmentName: asset.equipmentName,
        category: asset.deviceCategory,
        utilizationPercentage: Math.min(100, Math.round(utilizationPercentage * 100) / 100),
        usageHours: Math.round(usageHours * 100) / 100,
        sessionCount: logs.length,
        averageSessionDuration: Math.round(averageSessionDuration * 100) / 100,
        lastUsedAt,
        idleTimeHours: idleTimeHours ? Math.round(idleTimeHours * 100) / 100 : null,
        departmentName: asset.custodianDepartment?.departmentName || null,
      };
    });
  }

  async getByCategory(filters?: UtilizationFilters): Promise<CategoryUtilizationDto[]> {
    const { startDate, endDate } = this.getDateRange(filters);

    // Get all categories with assets
    const categories = await this.prisma.asset.findMany({
      where: {
        deletedAt: null,
        assetStatus: { in: ['ACTIVE', 'IN_SERVICE'] },
        ...(filters?.facilityId && { currentFacilityId: filters.facilityId }),
      },
      select: {
        deviceCategory: true,
        id: true,
        usageLogs: {
          where: {
            sessionStartTime: {
              gte: startDate,
              lte: endDate,
            },
            ...(filters?.departmentId && { departmentId: filters.departmentId }),
          },
        },
      },
    });

    // Group by category
    const categoryMap = new Map<string, { assets: Set<string>; logs: any[] }>();

    categories.forEach((asset) => {
      if (!categoryMap.has(asset.deviceCategory)) {
        categoryMap.set(asset.deviceCategory, { assets: new Set(), logs: [] });
      }
      const categoryData = categoryMap.get(asset.deviceCategory)!;
      categoryData.assets.add(asset.id);
      categoryData.logs.push(...asset.usageLogs);
    });

    const timeDiffMs = endDate.getTime() - startDate.getTime();
    const daysInPeriod = timeDiffMs / (1000 * 60 * 60 * 24);
    const availableHours = daysInPeriod * 24;

    return Array.from(categoryMap.entries()).map(([category, data]) => {
      const totalMinutes = data.logs.reduce((sum, log) => {
        if (log.durationMinutes) {
          return sum + Number(log.durationMinutes);
        }
        if (log.sessionEndTime) {
          return sum + (log.sessionEndTime.getTime() - log.sessionStartTime.getTime()) / (1000 * 60);
        }
        return sum;
      }, 0);

      const totalUsageHours = totalMinutes / 60;
      const assetCount = data.assets.size;
      const averageUtilization = assetCount > 0
        ? (totalUsageHours / (availableHours * assetCount)) * 100
        : 0;

      return {
        category,
        averageUtilization: Math.min(100, Math.round(averageUtilization * 100) / 100),
        totalUsageHours: Math.round(totalUsageHours * 100) / 100,
        assetCount,
        sessionCount: data.logs.length,
      };
    }).sort((a, b) => b.averageUtilization - a.averageUtilization);
  }

  async getByDepartment(filters?: UtilizationFilters): Promise<DepartmentUtilizationDto[]> {
    const { startDate, endDate } = this.getDateRange(filters);

    // Get departments with usage logs
    const departments = await this.prisma.department.findMany({
      where: {
        ...(filters?.facilityId && { facilityId: filters.facilityId }),
        usageLogs: {
          some: {
            sessionStartTime: {
              gte: startDate,
              lte: endDate,
            },
          },
        },
      },
      include: {
        usageLogs: {
          where: {
            sessionStartTime: {
              gte: startDate,
              lte: endDate,
            },
          },
        },
      },
    });

    const timeDiffMs = endDate.getTime() - startDate.getTime();
    const daysInPeriod = timeDiffMs / (1000 * 60 * 60 * 24);
    const availableHours = daysInPeriod * 24;

    return departments.map((dept) => {
      const logs = dept.usageLogs;
      const totalMinutes = logs.reduce((sum, log) => {
        if (log.durationMinutes) {
          return sum + Number(log.durationMinutes);
        }
        if (log.sessionEndTime) {
          return sum + (log.sessionEndTime.getTime() - log.sessionStartTime.getTime()) / (1000 * 60);
        }
        return sum;
      }, 0);

      const totalUsageHours = totalMinutes / 60;
      const uniqueAssets = new Set(logs.map((log) => log.assetId));
      const assetCount = uniqueAssets.size;
      const averageUtilization = assetCount > 0
        ? (totalUsageHours / (availableHours * assetCount)) * 100
        : 0;

      return {
        departmentId: dept.id,
        departmentName: dept.departmentName,
        averageUtilization: Math.min(100, Math.round(averageUtilization * 100) / 100),
        totalUsageHours: Math.round(totalUsageHours * 100) / 100,
        assetCount,
        sessionCount: logs.length,
      };
    }).sort((a, b) => b.averageUtilization - a.averageUtilization);
  }

  async getTrends(
    filters?: UtilizationFilters,
    granularity: 'day' | 'week' | 'month' = 'day',
  ): Promise<UtilizationTrendDto[]> {
    const { startDate, endDate } = this.getDateRange(filters);

    // Get usage logs grouped by time period
    const logs = await this.prisma.usageLog.findMany({
      where: {
        sessionStartTime: {
          gte: startDate,
          lte: endDate,
        },
        ...(filters?.departmentId && { departmentId: filters.departmentId }),
        ...(filters?.category && {
          asset: {
            deviceCategory: filters.category as any,
          },
        }),
        ...(filters?.facilityId && {
          asset: {
            currentFacilityId: filters.facilityId,
          },
        }),
      },
      include: {
        asset: {
          select: {
            id: true,
          },
        },
      },
      orderBy: {
        sessionStartTime: 'asc',
      },
    });

    // Group by time period
    const periodMap = new Map<string, { logs: typeof logs; assets: Set<string> }>();

    logs.forEach((log) => {
      const periodKey = this.getPeriodKey(log.sessionStartTime, granularity);
      if (!periodMap.has(periodKey)) {
        periodMap.set(periodKey, { logs: [], assets: new Set() });
      }
      const periodData = periodMap.get(periodKey)!;
      periodData.logs.push(log);
      periodData.assets.add(log.assetId);
    });

    // Calculate metrics for each period
    const periods = Array.from(periodMap.entries())
      .map(([date, data]) => {
        const totalMinutes = data.logs.reduce((sum, log) => {
          if (log.durationMinutes) {
            return sum + Number(log.durationMinutes);
          }
          if (log.sessionEndTime) {
            return sum + (log.sessionEndTime.getTime() - log.sessionStartTime.getTime()) / (1000 * 60);
          }
          return sum;
        }, 0);

        const usageHours = totalMinutes / 60;
        const periodHours = granularity === 'day' ? 24 : granularity === 'week' ? 168 : 730;
        const utilization = data.assets.size > 0
          ? (usageHours / (periodHours * data.assets.size)) * 100
          : 0;

        return {
          date,
          utilization: Math.min(100, Math.round(utilization * 100) / 100),
          usageHours: Math.round(usageHours * 100) / 100,
          activeAssets: data.assets.size,
          sessions: data.logs.length,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    return periods;
  }

  async getIdleAssets(
    maxUtilization: number = 30,
    minDaysIdle: number = 7,
    filters?: UtilizationFilters,
  ): Promise<IdleAssetDto[]> {
    const { startDate, endDate } = this.getDateRange(filters);

    // Get all assets
    const assets = await this.prisma.asset.findMany({
      where: {
        deletedAt: null,
        assetStatus: { in: ['ACTIVE', 'IN_SERVICE'] },
        ...(filters?.category && { deviceCategory: filters.category as any }),
        ...(filters?.facilityId && { currentFacilityId: filters.facilityId }),
      },
      include: {
        usageLogs: {
          where: {
            sessionStartTime: {
              gte: startDate,
              lte: endDate,
            },
          },
          orderBy: {
            sessionStartTime: 'desc',
          },
          take: 1,
        },
        custodianDepartment: {
          select: {
            departmentName: true,
          },
        },
      },
    });

    const timeDiffMs = endDate.getTime() - startDate.getTime();
    const daysInPeriod = timeDiffMs / (1000 * 60 * 60 * 24);
    const availableHours = daysInPeriod * 24;

    const idleAssets: IdleAssetDto[] = [];

    for (const asset of assets) {
      const allLogs = await this.prisma.usageLog.findMany({
        where: {
          assetId: asset.id,
          sessionStartTime: {
            gte: startDate,
            lte: endDate,
          },
        },
      });

      const totalMinutes = allLogs.reduce((sum, log) => {
        if (log.durationMinutes) {
          return sum + Number(log.durationMinutes);
        }
        if (log.sessionEndTime) {
          return sum + (log.sessionEndTime.getTime() - log.sessionStartTime.getTime()) / (1000 * 60);
        }
        return sum;
      }, 0);

      const usageHours = totalMinutes / 60;
      const utilizationPercentage = (usageHours / availableHours) * 100;

      const lastLog = asset.usageLogs[0] || allLogs[0];
      const lastUsedAt = lastLog?.sessionStartTime || null;
      const daysSinceLastUse = lastUsedAt
        ? (new Date().getTime() - lastUsedAt.getTime()) / (1000 * 60 * 60 * 24)
        : Infinity;

      if (
        (utilizationPercentage < maxUtilization || daysSinceLastUse >= minDaysIdle) &&
        (lastUsedAt === null || daysSinceLastUse >= minDaysIdle)
      ) {
        idleAssets.push({
          assetId: asset.id,
          assetTag: asset.assetTagNumber,
          equipmentName: asset.equipmentName,
          category: asset.deviceCategory,
          utilizationPercentage: Math.round(utilizationPercentage * 100) / 100,
          daysSinceLastUse: Math.round(daysSinceLastUse * 10) / 10,
          lastUsedAt,
          departmentName: asset.custodianDepartment?.departmentName || null,
        });
      }
    }

    return idleAssets.sort((a, b) => (b.daysSinceLastUse || 0) - (a.daysSinceLastUse || 0));
  }

  async getAssetDetails(assetId: string, filters?: UtilizationFilters): Promise<AssetUtilizationDetailsDto> {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: {
        usageLogs: {
          orderBy: {
            sessionStartTime: 'desc',
          },
        },
      },
    });

    if (!asset) {
      throw new Error(`Asset ${assetId} not found`);
    }

    const { startDate, endDate } = this.getDateRange(filters);

    const logs = asset.usageLogs.filter(
      (log) => log.sessionStartTime >= startDate && log.sessionStartTime <= endDate,
    );

    const totalMinutes = logs.reduce((sum, log) => {
      if (log.durationMinutes) {
        return sum + Number(log.durationMinutes);
      }
      if (log.sessionEndTime) {
        return sum + (log.sessionEndTime.getTime() - log.sessionStartTime.getTime()) / (1000 * 60);
      }
      return sum;
    }, 0);

    const usageHours = totalMinutes / 60;
    const timeDiffMs = endDate.getTime() - startDate.getTime();
    const daysInPeriod = timeDiffMs / (1000 * 60 * 60 * 24);
    const availableHours = daysInPeriod * 24;
    const utilizationPercentage = (usageHours / availableHours) * 100;

    const validSessions = logs.filter((log) => log.durationMinutes || log.sessionEndTime);
    const averageSessionDuration = validSessions.length > 0
      ? totalMinutes / validSessions.length
      : 0;

    // Calculate peak usage times
    const hourUsage: Record<number, number> = {};
    const dayUsage: Record<number, number> = {};

    logs.forEach((log) => {
      const hour = log.sessionStartTime.getHours();
      const day = log.sessionStartTime.getDay();
      const duration = log.durationMinutes ? Number(log.durationMinutes) / 60 : 0.5;

      hourUsage[hour] = (hourUsage[hour] || 0) + duration;
      dayUsage[day] = (dayUsage[day] || 0) + duration;
    });

    const peakUsageHourEntry = Object.entries(hourUsage)
      .sort(([, a], [, b]) => b - a)[0];
    const peakUsageDayEntry = Object.entries(dayUsage)
      .sort(([, a], [, b]) => b - a)[0];

    const peakUsageHour = peakUsageHourEntry ? parseInt(peakUsageHourEntry[0], 10) : 0;
    const peakUsageDay = peakUsageDayEntry ? parseInt(peakUsageDayEntry[0], 10) : 0;

    // Get trends (daily)
    const trends = await this.getTrends({ ...filters }, 'day');
    const assetTrends = trends.map((trend) => ({
      ...trend,
      utilization: trend.utilization, // This will be recalculated for single asset
    }));

    return {
      assetId: asset.id,
      assetTag: asset.assetTagNumber,
      equipmentName: asset.equipmentName,
      utilizationPercentage: Math.min(100, Math.round(utilizationPercentage * 100) / 100),
      totalUsageHours: Math.round(usageHours * 100) / 100,
      sessionCount: logs.length,
      averageSessionDuration: Math.round(averageSessionDuration * 100) / 100,
      peakUsageHour,
      peakUsageDay,
      lastUsedAt: logs[0]?.sessionStartTime || null,
      trends: assetTrends,
    };
  }

  private getDateRange(filters?: UtilizationFilters): { startDate: Date; endDate: Date } {
    const endDate = filters?.endDate || new Date();
    const startDate = filters?.startDate || new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // Default 30 days
    return { startDate, endDate };
  }

  private getPeriodKey(date: Date, granularity: 'day' | 'week' | 'month'): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    if (granularity === 'day') {
      return `${year}-${month}-${day}`;
    } else if (granularity === 'week') {
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const weekYear = weekStart.getFullYear();
      const weekMonth = String(weekStart.getMonth() + 1).padStart(2, '0');
      const weekDay = String(weekStart.getDate()).padStart(2, '0');
      return `${weekYear}-${weekMonth}-${weekDay}`;
    } else {
      return `${year}-${month}`;
    }
  }
}

