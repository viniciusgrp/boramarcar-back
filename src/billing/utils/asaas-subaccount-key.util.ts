import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

/**
 * Encrypts an Asaas subaccount apiKey for storage.
 * The env secret is hashed to a 32-byte AES key so any non-empty secret works.
 * The plaintext is never written into the returned error messages.
 */
export function encryptAsaasSubaccountApiKey(
  apiKey: string,
  secret: string,
): string {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(apiKey, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    'enc',
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

export function decryptAsaasSubaccountApiKey(
  payload: string,
  secret: string,
): string {
  const parts = payload.split(':');

  if (parts.length !== 5 || parts[0] !== 'enc' || parts[1] !== 'v1') {
    throw new Error('Invalid encrypted Asaas subaccount key payload');
  }

  const iv = Buffer.from(parts[2], 'base64url');
  const tag = Buffer.from(parts[3], 'base64url');
  const ciphertext = Buffer.from(parts[4], 'base64url');
  const decipher = createDecipheriv(ALGORITHM, deriveKey(secret), iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
}

function deriveKey(secret: string): Buffer {
  const trimmed = secret.trim();

  if (!trimmed) {
    throw new Error('ASAAS_SUBACCOUNT_KEY_ENCRYPTION_KEY is empty');
  }

  return createHash('sha256').update(trimmed, 'utf8').digest();
}
