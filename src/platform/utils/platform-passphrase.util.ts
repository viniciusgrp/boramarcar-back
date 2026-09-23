import { createHash, timingSafeEqual } from 'node:crypto';

export function passphraseMatches(
  provided: string | undefined,
  expected: string | undefined,
): boolean {
  if (!expected || !provided) {
    return false;
  }

  const left = createHash('sha256').update(provided, 'utf8').digest();
  const right = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(left, right);
}
