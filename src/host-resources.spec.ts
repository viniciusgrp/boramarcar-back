import { cpuUsedPercent, type CpuSample } from './host-resources';

describe('cpuUsedPercent', () => {
  it('returns null when the two samples are the same instant', () => {
    const sample: CpuSample = { idle: 10, total: 40 };
    expect(cpuUsedPercent(sample, sample)).toBeNull();
  });

  it('returns the busy share between two samples', () => {
    const previous: CpuSample = { idle: 0, total: 0 };
    const current: CpuSample = { idle: 25, total: 100 };
    expect(cpuUsedPercent(previous, current)).toBe(75);
  });

  it('clamps a negative idle delta to 100', () => {
    expect(cpuUsedPercent({ idle: 50, total: 100 }, { idle: 40, total: 110 })).toBe(
      100,
    );
  });
});
