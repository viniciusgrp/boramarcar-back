import {
  isCorsOriginAllowed,
  isPrivateLanHostname,
  isPrivateLanOrigin,
} from './cors-origin.util';

describe('cors-origin.util', () => {
  it('recognizes loopback and RFC1918 hosts', () => {
    expect(isPrivateLanHostname('localhost')).toBe(true);
    expect(isPrivateLanHostname('127.0.0.1')).toBe(true);
    expect(isPrivateLanHostname('192.168.15.6')).toBe(true);
    expect(isPrivateLanHostname('10.0.0.8')).toBe(true);
    expect(isPrivateLanHostname('172.16.1.4')).toBe(true);
    expect(isPrivateLanHostname('8.8.8.8')).toBe(false);
    expect(isPrivateLanHostname('boramarcar.com.br')).toBe(false);
  });

  it('parses LAN origins with a port', () => {
    expect(isPrivateLanOrigin('http://192.168.15.6:5173')).toBe(true);
    expect(isPrivateLanOrigin('http://localhost:5173')).toBe(true);
    expect(isPrivateLanOrigin('not-a-url')).toBe(false);
  });

  it('allows LAN origins only outside production', () => {
    expect(
      isCorsOriginAllowed({
        origin: 'http://192.168.15.6:5173',
        isProduction: false,
        allowedOrigins: ['http://localhost:5173'],
        corsAllowAll: false,
      }),
    ).toBe(true);

    expect(
      isCorsOriginAllowed({
        origin: 'http://192.168.15.6:5173',
        isProduction: true,
        allowedOrigins: ['http://localhost:5173'],
        corsAllowAll: false,
      }),
    ).toBe(false);
  });
});
