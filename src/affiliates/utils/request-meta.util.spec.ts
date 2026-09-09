import type { Request } from 'express';
import { extractClientIp, extractUserAgent } from './request-meta.util';

describe('request-meta.util', () => {
  it('prefers the first forwarded IP', () => {
    expect(
      extractClientIp({
        headers: { 'x-forwarded-for': '1.1.1.1, 2.2.2.2' },
        ip: '9.9.9.9',
      } as unknown as Request),
    ).toBe('1.1.1.1');
  });

  it('truncates user agents', () => {
    expect(
      extractUserAgent({
        headers: { 'user-agent': `  ${'a'.repeat(600)}  ` },
      } as unknown as Request),
    ).toHaveLength(512);
  });
});
