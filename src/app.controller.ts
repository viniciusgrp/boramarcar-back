import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AppService } from './app.service';
import {
  readCpuSample,
  readHostResources,
  type CpuSample,
  type HostResources,
} from './host-resources';

@Controller()
export class AppController {
  private cpuSample: CpuSample = readCpuSample();

  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @SkipThrottle()
  @Get('health')
  health(): {
    status: string;
    environment: string;
    timestamp: string;
    uptime: number;
    resources: HostResources;
  } {
    const { resources, cpuSample } = readHostResources(this.cpuSample);
    this.cpuSample = cpuSample;

    return {
      status: 'ok',
      environment: process.env.APP_ENV?.trim() || 'development',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      resources,
    };
  }
}
