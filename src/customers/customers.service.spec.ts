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

  it('confirms the email immediately when the tenant does not require confirmation', async () => {
    const createUser = jest.fn().mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    const service = new CustomersService(
      {
        getClient: () => ({ auth: { admin: { createUser } } }),
      } as never,
      {} as never,
      {} as never,
      {
        findById: jest.fn().mockResolvedValue({
          id: 'tenant-1',
          require_customer_email_confirmation: false,
        }),
      } as never,
    );

    await service.registerWithEmailPassword(
      'tenant-1',
      'Ana@Example.com',
      'secret123',
    );

    expect(createUser).toHaveBeenCalledWith({
      email: 'ana@example.com',
      password: 'secret123',
      email_confirm: true,
    });
  });

  it('does not create an unconfirmed account when confirmation is required', async () => {
    const createUser = jest.fn();
    const service = new CustomersService(
      {
        getClient: () => ({ auth: { admin: { createUser } } }),
      } as never,
      {} as never,
      {} as never,
      {
        findById: jest.fn().mockResolvedValue({
          id: 'tenant-1',
          require_customer_email_confirmation: true,
        }),
      } as never,
    );

    await expect(
      service.registerWithEmailPassword(
        'tenant-1',
        'ana@example.com',
        'secret123',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(createUser).not.toHaveBeenCalled();
  });
});
