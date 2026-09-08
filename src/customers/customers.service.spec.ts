import { BadRequestException } from '@nestjs/common';
import { CustomersService } from './customers.service';

describe('CustomersService', () => {
  it('requires tenantId on email registration', async () => {
    const service = new CustomersService({} as never, {} as never, {} as never, {
      findById: jest.fn(),
    } as never);

    await expect(
      service.registerWithEmailPassword(' ', 'ana@example.com', 'secret123'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
