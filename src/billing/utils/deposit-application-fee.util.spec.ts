import { InternalServerErrorException } from '@nestjs/common';
import {
  normalizeApplicationFeePercent,
  resolveConnectApplicationFeeAmount,
  resolveTenantDepositApplicationFeePercent,
} from './deposit-application-fee.util';

describe('deposit-application-fee.util', () => {
  describe('normalizeApplicationFeePercent', () => {
    it('returns null for nullish input', () => {
      expect(normalizeApplicationFeePercent(null)).toBeNull();
      expect(normalizeApplicationFeePercent(undefined)).toBeNull();
    });

    it('parses valid percent values', () => {
      expect(normalizeApplicationFeePercent(5)).toBe(5);
      expect(normalizeApplicationFeePercent('3.5')).toBe(3.5);
    });

    it('clamps negative values to zero', () => {
      expect(normalizeApplicationFeePercent(-1)).toBe(0);
    });

    it('throws when percent exceeds 100', () => {
      expect(() => normalizeApplicationFeePercent(101)).toThrow(
        InternalServerErrorException,
      );
    });

    it('returns null for non-numeric strings', () => {
      expect(normalizeApplicationFeePercent('invalid')).toBeNull();
    });
  });

  describe('resolveTenantDepositApplicationFeePercent', () => {
    it('uses tenant override when set', () => {
      expect(resolveTenantDepositApplicationFeePercent(3, 5)).toBe(3);
      expect(resolveTenantDepositApplicationFeePercent(0, 5)).toBe(0);
    });

    it('falls back to default when tenant override is null', () => {
      expect(resolveTenantDepositApplicationFeePercent(null, 5)).toBe(5);
      expect(resolveTenantDepositApplicationFeePercent(undefined, 5)).toBe(5);
    });

    it('throws when tenant override is invalid', () => {
      expect(() =>
        resolveTenantDepositApplicationFeePercent(Number.NaN, 5),
      ).toThrow(InternalServerErrorException);
    });
  });

  describe('resolveConnectApplicationFeeAmount', () => {
    it('returns zero when percent is zero or negative', () => {
      expect(resolveConnectApplicationFeeAmount(10_000, 0)).toBe(0);
      expect(resolveConnectApplicationFeeAmount(10_000, -1)).toBe(0);
    });

    it('rounds fee amount in cents', () => {
      expect(resolveConnectApplicationFeeAmount(10_000, 5)).toBe(500);
      expect(resolveConnectApplicationFeeAmount(10_001, 5)).toBe(500);
    });
  });
});
