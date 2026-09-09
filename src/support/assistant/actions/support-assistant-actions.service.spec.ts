import { BadRequestException } from '@nestjs/common';
import { SupportAssistantActionsService } from './support-assistant-actions.service';

describe('SupportAssistantActionsService', () => {
  it('rejects expired or missing proposals', async () => {
    const service = new SupportAssistantActionsService(
      { getForUser: jest.fn().mockReturnValue(null) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.executeProposal({
        context: { tenant: { id: 't1' } } as never,
        userId: 'user-1',
        proposalId: 'missing',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
