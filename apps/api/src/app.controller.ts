import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { Public } from './auth/decorators';
import { AppService } from './app.service';
import { PrismaService } from './database/prisma.service';

const READY_TIMEOUT_MS = 2_000;

@ApiTags('health')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Exposes a lightweight heartbeat so upstream monitors can verify uptime.
   * Public, so it reveals nothing about configuration.
   */
  @Public()
  @SkipThrottle()
  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint' })
  getHealth() {
    return this.appService.getHealth();
  }

  /**
   * Readiness for load balancers and orchestrators: 200 only when the
   * database answers, so traffic is not sent to an instance that can't
   * serve it. Liveness stays on /health.
   */
  @Public()
  @SkipThrottle()
  @Get('health/ready')
  @ApiOperation({
    summary: 'Readiness: 200 when the database answers, else 503',
  })
  async getReady() {
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), READY_TIMEOUT_MS),
        ),
      ]);
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ status: 'unavailable' });
    }
  }
}
