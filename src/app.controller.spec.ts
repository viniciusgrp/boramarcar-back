import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  it('returns an ok health payload', () => {
    const controller = new AppController(new AppService());
    const health = controller.health();

    expect(health.status).toBe('ok');
    expect(typeof health.timestamp).toBe('string');
    expect(health.resources.memory.totalMb).toBeGreaterThan(0);
    expect(health.resources.cpu.count).toBeGreaterThan(0);
    expect(health.resources.cpu.loadAverage).toHaveLength(3);
  });
});
