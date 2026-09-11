import * as Sentry from '@sentry/nestjs';
import { initializeSentry } from './sentry.init';

jest.mock('@sentry/nestjs', () => ({
  init: jest.fn(),
}));

describe('initializeSentry', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should not initialize Sentry if SENTRY_DSN is not provided', () => {
    delete process.env.SENTRY_DSN;

    const initialized = initializeSentry();

    expect(initialized).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('should initialize Sentry when SENTRY_DSN is set', () => {
    process.env.SENTRY_DSN = 'https://key@o0.ingest.sentry.io/123';
    process.env.NODE_ENV = 'production';

    const initialized = initializeSentry();

    expect(initialized).toBe(true);
    expect(Sentry.init).toHaveBeenCalledWith({
      dsn: 'https://key@o0.ingest.sentry.io/123',
      environment: 'production',
    });
  });
});
