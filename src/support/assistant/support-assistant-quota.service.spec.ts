import { HttpException } from '@nestjs/common';
import { SupportAssistantQuotaService } from './support-assistant-quota.service';

describe('SupportAssistantQuotaService', () => {
  it('blocks sending when the daily quota is exhausted', async () => {
    const config = { getMaxMessagesPerConversation: () => 40 };
    const repository = {
      countAuditEventsSince: jest.fn().mockResolvedValue(200),
      insertAuditEvent: jest.fn(),
      countMessagesInConversation: jest.fn(),
    };
    const service = new SupportAssistantQuotaService(
      config as never,
      repository as never,
    );

    await expect(
      service.assertCanSendMessage({
        tenantId: 'tenant-1',
        userId: 'user-1',
        conversationId: 'conv-1',
        planTier: 'SOLO',
      }),
    ).rejects.toBeInstanceOf(HttpException);
    expect(repository.insertAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'quota_hit' }),
    );
  });
});
