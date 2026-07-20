import { BadRequestException, ConflictException } from '@nestjs/common';
import { ReviewsService } from './reviews.service';

describe('ReviewsService', () => {
  const supabaseFrom = jest.fn();
  const supabaseService = {
    getClient: () => ({ from: supabaseFrom }),
  };

  const tenantsService = {
    findById: jest.fn(),
  };

  const customersService = {
    getMe: jest.fn(),
    findEquivalentCustomerIdsForTenant: jest.fn(),
  };

  let service: ReviewsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReviewsService(
      supabaseService as never,
      tenantsService as never,
      customersService as never,
    );
  });

  function mockAppointmentSelect(row: Record<string, unknown> | null) {
    supabaseFrom.mockImplementation((table: string) => {
      if (table === 'appointments') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: row, error: null }),
            }),
          }),
        };
      }

      if (table === 'customer_reviews') {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({
                data: {
                  id: 'review-1',
                  tenant_id: 'tenant-1',
                  appointment_id: 'appt-1',
                  customer_id: 'cust-1',
                  rating: 5,
                  comment: 'Ótimo',
                  status: 'PENDING',
                  published_at: null,
                  moderated_at: null,
                  moderated_by: null,
                  created_at: '2026-01-01T00:00:00.000Z',
                  updated_at: '2026-01-01T00:00:00.000Z',
                },
                error: null,
              }),
            }),
          }),
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: async () => ({ data: [], error: null }),
                }),
                maybeSingle: async () => ({ data: null, error: null }),
              }),
              in: async () => ({ data: [], error: null }),
              order: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });
  }

  it('rejects create when appointment is not COMPLETED', async () => {
    mockAppointmentSelect({
      id: 'appt-1',
      tenant_id: 'tenant-1',
      status: 'CONFIRMED',
      customer_id: 'cust-1',
      customer_name: 'Ana',
    });

    await expect(
      service.createForCustomer('user-1', {
        appointmentId: 'appt-1',
        rating: 5,
        comment: 'Ok',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates pending review when auto publish is off', async () => {
    mockAppointmentSelect({
      id: 'appt-1',
      tenant_id: 'tenant-1',
      status: 'COMPLETED',
      customer_id: 'cust-1',
      customer_name: 'Ana',
    });

    customersService.getMe.mockResolvedValue({
      customer: { id: 'cust-1', phone: '11999999999' },
      isProfileComplete: true,
    });
    customersService.findEquivalentCustomerIdsForTenant.mockResolvedValue([
      'cust-1',
    ]);
    tenantsService.findById.mockResolvedValue({
      id: 'tenant-1',
      reviews_enabled: true,
      reviews_auto_publish: false,
    });

    const review = await service.createForCustomer('user-1', {
      appointmentId: 'appt-1',
      rating: 5,
      comment: 'Ótimo',
    });

    expect(review.status).toBe('PENDING');
    expect(review.rating).toBe(5);
  });

  it('rejects duplicate review with conflict', async () => {
    mockAppointmentSelect({
      id: 'appt-1',
      tenant_id: 'tenant-1',
      status: 'COMPLETED',
      customer_id: 'cust-1',
      customer_name: 'Ana',
    });

    customersService.getMe.mockResolvedValue({
      customer: { id: 'cust-1', phone: '11999999999' },
      isProfileComplete: true,
    });
    customersService.findEquivalentCustomerIdsForTenant.mockResolvedValue([
      'cust-1',
    ]);
    tenantsService.findById.mockResolvedValue({
      id: 'tenant-1',
      reviews_enabled: true,
      reviews_auto_publish: true,
    });

    supabaseFrom.mockImplementation((table: string) => {
      if (table === 'appointments') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'appt-1',
                  tenant_id: 'tenant-1',
                  status: 'COMPLETED',
                  customer_id: 'cust-1',
                  customer_name: 'Ana',
                },
                error: null,
              }),
            }),
          }),
        };
      }

      return {
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: null,
              error: { code: '23505', message: 'duplicate' },
            }),
          }),
        }),
      };
    });

    await expect(
      service.createForCustomer('user-1', {
        appointmentId: 'appt-1',
        rating: 4,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns empty public list when reviews disabled', async () => {
    tenantsService.findById.mockResolvedValue({
      id: 'tenant-1',
      reviews_enabled: false,
    });

    const result = await service.findPublicByTenantId('tenant-1');

    expect(result).toEqual({
      averageRating: null,
      totalCount: 0,
      reviews: [],
    });
  });
});
