import { isProductionAppEnv } from './app-env.util';

describe('isProductionAppEnv', () => {
  it('is true only for production', () => {
    expect(isProductionAppEnv('production')).toBe(true);
    expect(isProductionAppEnv(' Production ')).toBe(true);
    expect(isProductionAppEnv('development')).toBe(false);
    expect(isProductionAppEnv('hml')).toBe(false);
    expect(isProductionAppEnv(undefined)).toBe(false);
    expect(isProductionAppEnv('')).toBe(false);
  });
});
