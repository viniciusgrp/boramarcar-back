import { timingSafeEqual } from 'crypto';

export function isValidAsaasWebhookToken(
  provided: string | undefined,
  expected: string | undefined,
): boolean {
  const received = provided?.trim() ?? '';
  const configured = expected?.trim() ?? '';

  if (!received || !configured) {
    return false;
  }

  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(configured);

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(receivedBuffer, expectedBuffer);
}
