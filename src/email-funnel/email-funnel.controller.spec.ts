import { EmailFunnelController } from './email-funnel.controller';

describe('EmailFunnelController', () => {
  it('runs the due email routine and returns how many actions were processed', async () => {
    const processDueEmails = jest.fn().mockResolvedValue(3);
    const controller = new EmailFunnelController({
      processDueEmails,
    } as never);

    await expect(controller.runDueEmails()).resolves.toEqual({ processed: 3 });
    expect(processDueEmails).toHaveBeenCalledTimes(1);
  });
});
