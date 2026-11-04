import { cpus, freemem, loadavg, totalmem } from 'node:os';

export interface CpuSample {
  idle: number;
  total: number;
}

export interface HostResources {
  memory: {
    totalMb: number;
    usedMb: number;
    freeMb: number;
    usedPercent: number;
  };
  cpu: {
    count: number;
    usedPercent: number | null;
    loadAverage: [number, number, number];
  };
}

export function readCpuSample(): CpuSample {
  let idle = 0;
  let total = 0;

  for (const cpu of cpus()) {
    const times = cpu.times;
    idle += times.idle;
    total += times.user + times.nice + times.sys + times.idle + times.irq;
  }

  return { idle, total };
}

/** Percent busy between two samples. Null when the interval is empty. */
export function cpuUsedPercent(
  previous: CpuSample,
  current: CpuSample,
): number | null {
  const totalDelta = current.total - previous.total;
  if (totalDelta <= 0) {
    return null;
  }

  const idleDelta = current.idle - previous.idle;
  const percent = (1 - idleDelta / totalDelta) * 100;
  const clamped = Math.min(100, Math.max(0, percent));
  return Math.round(clamped * 10) / 10;
}

export function readHostResources(previousCpu: CpuSample): {
  resources: HostResources;
  cpuSample: CpuSample;
} {
  const totalBytes = totalmem();
  const freeBytes = freemem();
  const usedBytes = Math.max(0, totalBytes - freeBytes);
  const cpuSample = readCpuSample();
  const [one, five, fifteen] = loadavg();

  return {
    cpuSample,
    resources: {
      memory: {
        totalMb: Math.round(totalBytes / 1024 / 1024),
        usedMb: Math.round(usedBytes / 1024 / 1024),
        freeMb: Math.round(freeBytes / 1024 / 1024),
        usedPercent:
          totalBytes > 0
            ? Math.round((usedBytes / totalBytes) * 1000) / 10
            : 0,
      },
      cpu: {
        count: cpus().length,
        usedPercent: cpuUsedPercent(previousCpu, cpuSample),
        loadAverage: [
          Math.round(one * 100) / 100,
          Math.round(five * 100) / 100,
          Math.round(fifteen * 100) / 100,
        ],
      },
    },
  };
}
