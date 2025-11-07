import { loadApiConfig } from '@medasset/config';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    const config = loadApiConfig();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: config.nodeEnv,
      clientUrl: config.clientUrl,
    };
  }
}
