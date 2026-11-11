import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  SendEmailFunnelPreviewDto,
  SendEmailFunnelTestDto,
} from './dto/email-funnel.dto';
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

  it('sends a test email using the URL stepKey with body { to } only', async () => {
    const sendTestEmail = jest.fn().mockResolvedValue({ ok: true });
    const controller = new EmailFunnelController({
      sendTestEmail,
    } as never);

    await expect(
      controller.sendTestEmail('welcome_day_0', { to: 'tester@example.com' }),
    ).resolves.toEqual({ ok: true });
    expect(sendTestEmail).toHaveBeenCalledWith({
      stepKey: 'welcome_day_0',
      to: 'tester@example.com',
      tenantId: undefined,
    });
  });

  it('forwards optional tenant_id when sending a step test email', async () => {
    const sendTestEmail = jest.fn().mockResolvedValue({ ok: true });
    const controller = new EmailFunnelController({
      sendTestEmail,
    } as never);

    await expect(
      controller.sendTestEmail('welcome_day_1', {
        to: 'tester@example.com',
        tenant_id: 'tenant-42',
      }),
    ).resolves.toEqual({ ok: true });
    expect(sendTestEmail).toHaveBeenCalledWith({
      stepKey: 'welcome_day_1',
      to: 'tester@example.com',
      tenantId: 'tenant-42',
    });
  });

  it('keeps requiring step_key in the body for the legacy test-send route', async () => {
    const sendPreview = jest.fn().mockResolvedValue({ ok: true });
    const controller = new EmailFunnelController({
      sendPreview,
    } as never);

    await expect(
      controller.sendTest({
        step_key: 'welcome_day_0',
        to: 'tester@example.com',
      }),
    ).resolves.toEqual({ ok: true });
    expect(sendPreview).toHaveBeenCalledWith({
      stepKey: 'welcome_day_0',
      to: 'tester@example.com',
    });
  });
});

describe('SendEmailFunnelTestDto', () => {
  it('accepts a body with only { to }', async () => {
    const dto = plainToInstance(SendEmailFunnelTestDto, {
      to: 'tester@example.com',
    });
    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('accepts optional tenant_id without step_key', async () => {
    const dto = plainToInstance(SendEmailFunnelTestDto, {
      to: 'tester@example.com',
      tenant_id: 'tenant-42',
    });
    await expect(validate(dto)).resolves.toEqual([]);
  });
});

describe('SendEmailFunnelPreviewDto', () => {
  it('still requires step_key in the body', async () => {
    const dto = plainToInstance(SendEmailFunnelPreviewDto, {
      to: 'tester@example.com',
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'step_key')).toBe(true);
  });
});
