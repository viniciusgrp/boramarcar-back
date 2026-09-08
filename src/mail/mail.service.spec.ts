import { MailService } from './mail.service';

describe('MailService', () => {
  it('is unconfigured without SMTP settings', () => {
    const service = new MailService({
      get: () => undefined,
    } as never);

    expect(service.isConfigured()).toBe(false);
  });
});
