import { BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';

describe('UsersService', () => {
  it('blocks deleting tenant panel accounts', async () => {
    const service = new UsersService({} as never, {
      findByUserId: jest.fn().mockResolvedValue({ id: 'tu-1' }),
    } as never);

    await expect(service.deleteAuthenticatedUser('user-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
