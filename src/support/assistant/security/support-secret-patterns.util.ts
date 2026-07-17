export const SUPPORT_SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\bsk_(?:live|test)_[A-Za-z0-9]+\b/,
  /\bwhsec_[A-Za-z0-9]+\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  /postgresql:\/\/\S+/i,
];

export function containsBlockedSecretDump(text: string): boolean {
  return SUPPORT_SECRET_PATTERNS.some((pattern) => pattern.test(text));
}

export function redactSecrets(text: string): string {
  let result = text;
  for (const pattern of SUPPORT_SECRET_PATTERNS) {
    result = result.replace(pattern, '[redigido]');
  }
  return result;
}
