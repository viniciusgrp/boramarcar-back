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

  it('lists recorded sends and resends one by id', async () => {
    const listSends = jest.fn().mockResolvedValue([{ id: 'send-1' }]);
    const resend = jest.fn().mockResolvedValue({ id: 'send-1', status: 'sent' });
    const controller = new EmailFunnelController({
      listSends,
      resend,
    } as never);

    await expect(controller.listSends()).resolves.toEqual([{ id: 'send-1' }]);
    await expect(controller.resend('send-1')).resolves.toEqual({
      id: 'send-1',
      status: 'sent',
    });
    expect(resend).toHaveBeenCalledWith('send-1');
  });
});
