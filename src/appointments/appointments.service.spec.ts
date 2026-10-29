import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import type { ResolvedBookingServices } from './types/resolved-booking-service.type';
import { buildWallClockDateTime } from '../schedule/utils/wall-clock-datetime.util';
import { createChainableQuery } from '../test-utils/supabase-mock';
import type { Tenant } from '../tenants/entities/tenant.entity';
import type { Appointment } from './entities/appointment.entity';
import { POSTGRES_EXCLUSION_VIOLATION } from './utils/booking-slot-overlap.util';

const booking: ResolvedBookingServices = {
  items: [
    {
      id: 'svc-1',
      name: 'Corte',
      durationMinutes: 60,
      price: 50,
      requiresDeposit: false,
      depositAmount: 0,
    },
  ],
  totalDurationMinutes: 60,
  totalPrice: 50,
  totalDepositAmount: 0,
  requiresDeposit: false,
};

function stub<T extends object>(overrides: Partial<T> = {}): T {
  return overrides as T;
}

function buildTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 'tenant-1',
    name: 'Studio',
    slug: 'studio',
    require_customer_account: false,
    deposit_feature_enabled: false,
    plan_tier: 'SOLO',
    booking_acceptance_type: 'AUTOMATIC',
    booking_slot_interval_minutes: 60,
    stripe_connect_account_id: null,
    stripe_connect_charges_enabled: false,
    ...overrides,
  } as Tenant;
}

function buildService() {
  const from = jest.fn();
  const professionalHoursService = {
    getEffectiveScheduleForDate: jest.fn(),
    findAllByProfessional: jest.fn(),
  };
  const businessHoursService = {
    findAllByTenant: jest.fn(),
  };
  const professionalAbsencesService = {
    findOverlappingForProfessionalOnDate: jest.fn().mockResolvedValue([]),
    hasAbsenceOverlap: jest.fn().mockResolvedValue(false),
    parseAndValidateRange: jest.fn(),
  };
  const professionalsService = {
    findActivePerformingAllServices: jest.fn(),
    assertProfessionalPerformsAllServices: jest.fn(),
  };
  const tenantsService = {
    findById: jest.fn(),
  };
  const billingService = {
    createDepositCheckoutSession: jest.fn(),
  };
  const loyaltyService = {
    findOrCreateCustomerForAppointment: jest.fn(),
    validateRewardForAppointmentBooking: jest.fn(),
    buildBookingLoyaltyFeedback: jest.fn().mockResolvedValue(null),
    resolveCustomerReferralCodeForAppointment: jest.fn().mockResolvedValue(null),
    redeemRewardForAppointment: jest.fn(),
    refundRedeemedPointsForAppointment: jest.fn(),
    restoreRedeemedPointsForAppointment: jest.fn(),
  };
  const couponsService = {
    validateCouponForBooking: jest.fn(),
    redeemCouponForAppointment: jest.fn(),
  };
  const customersService = {
    resolveForAuthenticatedBooking: jest.fn(),
    findByIdForTenant: jest.fn(),
  };
  const depositPaymentService = {
    confirmDepositPayment: jest.fn(),
    releasePendingDepositHold: jest.fn(),
    expireAbandonedDepositHolds: jest.fn(),
    markDepositRefunded: jest.fn(),
    releasePendingDepositHoldWithAccessToken: jest.fn(),
  };
  const mailService = {
    sendAppointmentReminder: jest.fn().mockResolvedValue(undefined),
  };

  const service = new AppointmentsService(
    { getClient: () => ({ from }) } as never,
    professionalHoursService as never,
    businessHoursService as never,
    professionalAbsencesService as never,
    professionalsService as never,
    tenantsService as never,
    billingService as never,
    loyaltyService as never,
    couponsService as never,
    customersService as never,
    stub(),
    stub(),
    mailService as never,
    depositPaymentService as never,
    stub(),
    stub(),
  );

  return {
    service,
    from,
    professionalHoursService,
    businessHoursService,
    professionalAbsencesService,
    professionalsService,
    tenantsService,
    billingService,
    loyaltyService,
    couponsService,
    depositPaymentService,
    mailService,
  };
}

describe('AppointmentsService', () => {
  describe('availability', () => {
    it('returns no days when the business has no open weekdays', async () => {
      const { service, businessHoursService } = buildService();
      businessHoursService.findAllByTenant.mockResolvedValue([
        { dayOfWeek: 1, isClosed: true },
      ]);

      await expect(
        service.getAvailableDays('tenant-1', ['svc-1'], { professionalId: 'pro-1' }),
      ).resolves.toEqual([]);
    });

    it('returns no slots when no professional performs the services', async () => {
      const { service, professionalsService, tenantsService } = buildService();
      professionalsService.findActivePerformingAllServices.mockResolvedValue([]);
      tenantsService.findById.mockResolvedValue(buildTenant());
      jest
        .spyOn(service as never as { resolveBookingServices: () => Promise<ResolvedBookingServices> }, 'resolveBookingServices')
        .mockResolvedValue(booking);

      await expect(
        service.getAvailabilityForAnyProfessional('tenant-1', ['svc-1'], '2099-01-15'),
      ).resolves.toEqual([]);
    });

    it('skips closed professional days', async () => {
      const ctx = buildService();
      ctx.tenantsService.findById.mockResolvedValue(buildTenant());
      jest
        .spyOn(ctx.service as never as { resolveBookingServices: () => Promise<ResolvedBookingServices> }, 'resolveBookingServices')
        .mockResolvedValue(booking);
      ctx.professionalHoursService.getEffectiveScheduleForDate.mockResolvedValue({
        isClosed: true,
      });

      await expect(
        ctx.service.getAvailability('tenant-1', 'pro-1', ['svc-1'], '2099-01-15'),
      ).resolves.toEqual([]);
    });

    it('occupies PENDING_PAYMENT holds and leaves adjacent slots free', async () => {
      const ctx = buildService();
      ctx.tenantsService.findById.mockResolvedValue(buildTenant());
      jest
        .spyOn(ctx.service as never as { resolveBookingServices: () => Promise<ResolvedBookingServices> }, 'resolveBookingServices')
        .mockResolvedValue(booking);
      ctx.professionalHoursService.getEffectiveScheduleForDate.mockResolvedValue({
        isClosed: false,
        openAt: buildWallClockDateTime('2099-01-15', '09:00'),
        closeAt: buildWallClockDateTime('2099-01-15', '12:00'),
      });
      ctx.from.mockReturnValue(
        createChainableQuery({
          data: [
            {
              id: 'hold-1',
              start_time: '2099-01-15T10:00:00.000Z',
              end_time: '2099-01-15T11:00:00.000Z',
            },
          ],
          error: null,
        }),
      );

      const slots = await ctx.service.getAvailability(
        'tenant-1',
        'pro-1',
        ['svc-1'],
        '2099-01-15',
      );

      expect(slots).toEqual(['09:00', '11:00']);
    });
  });

  describe('create', () => {
    it('rejects missing required fields', async () => {
      const { service } = buildService();
      await expect(service.create({} as never)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects unknown tenants', async () => {
      const { service, tenantsService } = buildService();
      tenantsService.findById.mockResolvedValue(null);

      await expect(
        service.create({
          tenantId: 'tenant-1',
          professionalId: 'pro-1',
          startTime: '2099-01-15T09:00:00.000Z',
          customerName: 'Ana',
          customerPhone: '11999999999',
          serviceIds: ['svc-1'],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('requires an account when the tenant demands it', async () => {
      const { service, tenantsService } = buildService();
      tenantsService.findById.mockResolvedValue(
        buildTenant({ require_customer_account: true }),
      );

      await expect(
        service.create({
          tenantId: 'tenant-1',
          professionalId: 'pro-1',
          startTime: '2099-01-15T09:00:00.000Z',
          customerName: 'Ana',
          customerPhone: '11999999999',
          serviceIds: ['svc-1'],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects overlapping public bookings', async () => {
      const ctx = buildService();
      ctx.tenantsService.findById.mockResolvedValue(buildTenant());
      jest
        .spyOn(ctx.service as never as { resolveBookingServices: () => Promise<ResolvedBookingServices> }, 'resolveBookingServices')
        .mockResolvedValue(booking);
      jest
        .spyOn(ctx.service as never as { hasBookingConflict: () => Promise<boolean> }, 'hasBookingConflict')
        .mockResolvedValue(true);

      await expect(
        ctx.service.create({
          tenantId: 'tenant-1',
          professionalId: 'pro-1',
          startTime: '2099-01-15T09:00:00.000Z',
          customerName: 'Ana',
          customerPhone: '11999999999',
          serviceIds: ['svc-1'],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('confirms automatic bookings without deposit', async () => {
      const ctx = buildService();
      ctx.tenantsService.findById.mockResolvedValue(buildTenant());
      jest
        .spyOn(ctx.service as never as { resolveBookingServices: () => Promise<ResolvedBookingServices> }, 'resolveBookingServices')
        .mockResolvedValue(booking);
      jest
        .spyOn(ctx.service as never as { hasBookingConflict: () => Promise<boolean> }, 'hasBookingConflict')
        .mockResolvedValue(false);
      jest
        .spyOn(
          ctx.service as never as {
            resolveProfessionalBookingSettings: () => Promise<{
              name: string;
              contact_phone: string | null;
              bookingAcceptanceType: 'DEFAULT';
            }>;
          },
          'resolveProfessionalBookingSettings',
        )
        .mockResolvedValue({
          name: 'João',
          contact_phone: '11988888888',
          bookingAcceptanceType: 'DEFAULT',
        });
      jest
        .spyOn(ctx.service as never as { insertAppointmentServices: () => Promise<void> }, 'insertAppointmentServices')
        .mockResolvedValue(undefined);
      jest
        .spyOn(ctx.service as never as { dispatchAppointmentEmails: () => void }, 'dispatchAppointmentEmails')
        .mockReturnValue(undefined);

      ctx.loyaltyService.findOrCreateCustomerForAppointment.mockResolvedValue({
        customer: { id: 'cust-1', name: 'Ana', phone: '11999999999', email: null },
        isNew: true,
      });

      const inserted = {
        id: 'appt-1',
        tenant_id: 'tenant-1',
        professional_id: 'pro-1',
        service_id: 'svc-1',
        customer_id: 'cust-1',
        customer_name: 'Ana',
        customer_phone: '11999999999',
        start_time: '2099-01-15T09:00:00.000Z',
        end_time: '2099-01-15T10:00:00.000Z',
        status: 'CONFIRMED',
        deposit_paid: false,
        payment_status: 'PAID',
        commission_amount: 0,
        booking_source: 'PUBLIC',
        guest_access_token: 'secret-token',
      } as Appointment;

      ctx.from.mockReturnValue(
        createChainableQuery({ data: inserted, error: null }),
      );

      const result = await ctx.service.create({
        tenantId: 'tenant-1',
        professionalId: 'pro-1',
        startTime: '2099-01-15T09:00:00.000Z',
        customerName: 'Ana',
        customerPhone: '11999999999',
        serviceIds: ['svc-1'],
      });

      expect(result.appointment.status).toBe('CONFIRMED');
      expect(result.appointment.guest_access_token).toBeNull();
      expect(result.checkoutUrl).toBeUndefined();
    });

    it('marks the first-appointment onboarding milestone after a successful booking', async () => {
      const ctx = buildService();
      ctx.tenantsService.findById.mockResolvedValue(buildTenant());
      jest
        .spyOn(ctx.service as never as { resolveBookingServices: () => Promise<ResolvedBookingServices> }, 'resolveBookingServices')
        .mockResolvedValue(booking);
      jest
        .spyOn(ctx.service as never as { hasBookingConflict: () => Promise<boolean> }, 'hasBookingConflict')
        .mockResolvedValue(false);
      jest
        .spyOn(
          ctx.service as never as {
            resolveProfessionalBookingSettings: () => Promise<{
              name: string;
              contact_phone: string | null;
              bookingAcceptanceType: 'DEFAULT';
            }>;
          },
          'resolveProfessionalBookingSettings',
        )
        .mockResolvedValue({
          name: 'João',
          contact_phone: '11988888888',
          bookingAcceptanceType: 'DEFAULT',
        });
      jest
        .spyOn(ctx.service as never as { insertAppointmentServices: () => Promise<void> }, 'insertAppointmentServices')
        .mockResolvedValue(undefined);
      jest
        .spyOn(ctx.service as never as { dispatchAppointmentEmails: () => void }, 'dispatchAppointmentEmails')
        .mockReturnValue(undefined);

      ctx.loyaltyService.findOrCreateCustomerForAppointment.mockResolvedValue({
        customer: { id: 'cust-1', name: 'Ana', phone: '11999999999', email: null },
        isNew: true,
      });

      const inserted = {
        id: 'appt-1',
        tenant_id: 'tenant-1',
        professional_id: 'pro-1',
        service_id: 'svc-1',
        customer_id: 'cust-1',
        customer_name: 'Ana',
        customer_phone: '11999999999',
        start_time: '2099-01-15T09:00:00.000Z',
        end_time: '2099-01-15T10:00:00.000Z',
        status: 'CONFIRMED',
        deposit_paid: false,
        payment_status: 'PAID',
        commission_amount: 0,
        booking_source: 'PUBLIC',
        guest_access_token: 'secret-token',
      } as Appointment;

      const chainable = createChainableQuery({ data: inserted, error: null });
      ctx.from.mockReturnValue(chainable);

      await ctx.service.create({
        tenantId: 'tenant-1',
        professionalId: 'pro-1',
        startTime: '2099-01-15T09:00:00.000Z',
        customerName: 'Ana',
        customerPhone: '11999999999',
        serviceIds: ['svc-1'],
      });

      expect(ctx.from).toHaveBeenCalledWith('tenants');
      expect(chainable.update).toHaveBeenCalledWith(
        expect.objectContaining({
          initial_setup_first_appointment_at: expect.any(String),
        }),
      );
      expect(chainable.is).toHaveBeenCalledWith(
        'initial_setup_first_appointment_at',
        null,
      );
    });

    it('maps overlap constraint errors on insert to ConflictException', async () => {
      const ctx = buildService();
      ctx.tenantsService.findById.mockResolvedValue(buildTenant());
      jest
        .spyOn(ctx.service as never as { resolveBookingServices: () => Promise<ResolvedBookingServices> }, 'resolveBookingServices')
        .mockResolvedValue(booking);
      jest
        .spyOn(ctx.service as never as { hasBookingConflict: () => Promise<boolean> }, 'hasBookingConflict')
        .mockResolvedValue(false);
      jest
        .spyOn(
          ctx.service as never as {
            resolveProfessionalBookingSettings: () => Promise<{
              name: string;
              contact_phone: string | null;
              bookingAcceptanceType: 'DEFAULT';
            }>;
          },
          'resolveProfessionalBookingSettings',
        )
        .mockResolvedValue({
          name: 'João',
          contact_phone: null,
          bookingAcceptanceType: 'DEFAULT',
        });
      ctx.loyaltyService.findOrCreateCustomerForAppointment.mockResolvedValue({
        customer: { id: 'cust-1', name: 'Ana', phone: '11999999999' },
        isNew: false,
      });
      ctx.from.mockReturnValue(
        createChainableQuery({
          data: null,
          error: { code: POSTGRES_EXCLUSION_VIOLATION, message: 'overlap' },
        }),
      );

      await expect(
        ctx.service.create({
          tenantId: 'tenant-1',
          professionalId: 'pro-1',
          startTime: '2099-01-15T09:00:00.000Z',
          customerName: 'Ana',
          customerPhone: '11999999999',
          serviceIds: ['svc-1'],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('approval and status', () => {
    it('approves only PENDING_APPROVAL appointments', async () => {
      const { service } = buildService();
      jest
        .spyOn(
          service as never as {
            loadAppointmentEmailContext: () => Promise<{
              appointment: { professional_id: string; status: string };
            }>;
          },
          'loadAppointmentEmailContext',
        )
        .mockResolvedValue({
          appointment: { professional_id: 'pro-1', status: 'CONFIRMED' },
        });

      await expect(
        service.approveAppointmentForTenant('tenant-1', 'appt-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects only PENDING_APPROVAL appointments', async () => {
      const { service } = buildService();
      jest
        .spyOn(
          service as never as {
            loadAppointmentEmailContext: () => Promise<{
              appointment: { professional_id: string; status: string };
            }>;
          },
          'loadAppointmentEmailContext',
        )
        .mockResolvedValue({
          appointment: { professional_id: 'pro-1', status: 'CONFIRMED' },
        });

      await expect(
        service.rejectAppointmentForTenant('tenant-1', 'appt-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('blocks a professional from inspecting another agenda via absence conflicts', async () => {
      const { service } = buildService();

      await expect(
        service.findConflictingAppointmentsForAbsenceRange(
          'tenant-1',
          'pro-2',
          { startsAt: '2099-01-15T09:00:00.000Z', endsAt: '2099-01-15T12:00:00.000Z' },
          'pro-1',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects invalid status updates', async () => {
      const { service } = buildService();
      await expect(
        service.updateStatusForTenant('tenant-1', 'appt-1', 'NOT_A_STATUS' as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('createInternal', () => {
    it('requires professional and start time', async () => {
      const { service } = buildService();
      await expect(
        service.createInternal('tenant-1', { serviceIds: ['svc-1'] } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('blocks a professional from creating for another profile', async () => {
      const { service } = buildService();
      await expect(
        service.createInternal(
          'tenant-1',
          {
            professionalId: 'pro-2',
            startTime: '2099-01-15T09:00:00.000Z',
            serviceIds: ['svc-1'],
            customerName: 'Ana',
            customerPhone: '11999999999',
          },
          'pro-1',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('stores a custom duration and blocks the agenda until that end time', async () => {
      const ctx = buildService();
      jest
        .spyOn(
          ctx.service as never as {
            resolveBookingServices: () => Promise<ResolvedBookingServices>;
          },
          'resolveBookingServices',
        )
        .mockResolvedValue(booking);
      jest
        .spyOn(
          ctx.service as never as {
            resolveCustomerForInternal: () => Promise<{
              customerId: string | null;
              name: string;
              phone: string;
            }>;
          },
          'resolveCustomerForInternal',
        )
        .mockResolvedValue({
          customerId: null,
          name: 'Ana',
          phone: '11999999999',
        });
      const hasConflict = jest
        .spyOn(
          ctx.service as never as { hasBookingConflict: () => Promise<boolean> },
          'hasBookingConflict',
        )
        .mockResolvedValue(false);
      jest
        .spyOn(
          ctx.service as never as { insertAppointmentServices: () => Promise<void> },
          'insertAppointmentServices',
        )
        .mockResolvedValue(undefined);
      ctx.professionalHoursService.getEffectiveScheduleForDate.mockResolvedValue({
        isClosed: false,
        openAt: buildWallClockDateTime('2099-01-15', '08:00'),
        closeAt: buildWallClockDateTime('2099-01-15', '18:00'),
      });

      const chain = createChainableQuery({
        data: {
          id: 'appt-1',
          customer_id: null,
          professional_id: 'pro-1',
          service_id: 'svc-1',
          customer_name: 'Ana',
          customer_phone: '11999999999',
          start_time: '2099-01-15T09:00:00.000Z',
          end_time: '2099-01-15T09:45:00.000Z',
          status: 'CONFIRMED',
          booking_source: 'INTERNAL',
          total_duration_minutes: 45,
          total_price: 50,
          loyalty_reward_id: null,
          professionals: { name: 'João' },
          services: { name: 'Corte', duration_minutes: 60, price: 50 },
          appointment_services: [
            {
              service_id: 'svc-1',
              sort_order: 0,
              duration_minutes: 60,
              price: 50,
              services: { name: 'Corte' },
            },
          ],
        },
        error: null,
      });
      ctx.from.mockReturnValue(chain);

      const created = await ctx.service.createInternal('tenant-1', {
        professionalId: 'pro-1',
        startTime: '2099-01-15T09:00:00.000Z',
        serviceIds: ['svc-1'],
        customerName: 'Ana',
        customerPhone: '11999999999',
        durationMinutes: 45,
      });

      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          total_duration_minutes: 45,
          end_time: '2099-01-15T09:45:00.000Z',
          total_price: 50,
        }),
      );
      const conflictCalls = hasConflict.mock.calls as unknown as Array<
        [string, string, Date, Date]
      >;
      expect(conflictCalls[0][3].getHours()).toBe(9);
      expect(conflictCalls[0][3].getMinutes()).toBe(45);
      expect(created.durationMinutes).toBe(45);
    });

    it('keeps the catalog duration when the internal booking omits an override', async () => {
      const ctx = buildService();
      jest
        .spyOn(
          ctx.service as never as {
            resolveBookingServices: () => Promise<ResolvedBookingServices>;
          },
          'resolveBookingServices',
        )
        .mockResolvedValue(booking);
      jest
        .spyOn(
          ctx.service as never as {
            resolveCustomerForInternal: () => Promise<{
              customerId: string | null;
              name: string;
              phone: string;
            }>;
          },
          'resolveCustomerForInternal',
        )
        .mockResolvedValue({
          customerId: null,
          name: 'Ana',
          phone: '11999999999',
        });
      jest
        .spyOn(
          ctx.service as never as { hasBookingConflict: () => Promise<boolean> },
          'hasBookingConflict',
        )
        .mockResolvedValue(false);
      jest
        .spyOn(
          ctx.service as never as { insertAppointmentServices: () => Promise<void> },
          'insertAppointmentServices',
        )
        .mockResolvedValue(undefined);
      ctx.professionalHoursService.getEffectiveScheduleForDate.mockResolvedValue({
        isClosed: false,
        openAt: buildWallClockDateTime('2099-01-15', '08:00'),
        closeAt: buildWallClockDateTime('2099-01-15', '18:00'),
      });

      const chain = createChainableQuery({
        data: {
          id: 'appt-1',
          customer_id: null,
          professional_id: 'pro-1',
          customer_name: 'Ana',
          customer_phone: '11999999999',
          start_time: '2099-01-15T09:00:00.000Z',
          end_time: '2099-01-15T10:00:00.000Z',
          status: 'CONFIRMED',
          booking_source: 'INTERNAL',
          total_duration_minutes: 60,
          total_price: 50,
          professionals: { name: 'João' },
          services: { name: 'Corte', duration_minutes: 60, price: 50 },
          appointment_services: [],
        },
        error: null,
      });
      ctx.from.mockReturnValue(chain);

      await ctx.service.createInternal('tenant-1', {
        professionalId: 'pro-1',
        startTime: '2099-01-15T09:00:00.000Z',
        serviceIds: ['svc-1'],
        customerName: 'Ana',
        customerPhone: '11999999999',
      });

      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          total_duration_minutes: 60,
          end_time: '2099-01-15T10:00:00.000Z',
        }),
      );
    });

    it('rejects a non-positive custom duration', async () => {
      const { service } = buildService();

      await expect(
        service.createInternal('tenant-1', {
          professionalId: 'pro-1',
          startTime: '2099-01-15T09:00:00.000Z',
          serviceIds: ['svc-1'],
          customerName: 'Ana',
          customerPhone: '11999999999',
          durationMinutes: 0,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('updateDurationForTenant', () => {
    const existingAppointment = {
      id: 'appt-1',
      status: 'CONFIRMED',
      professional_id: 'pro-1',
      start_time: '2099-01-15T09:00:00.000Z',
      end_time: '2099-01-15T10:00:00.000Z',
      total_duration_minutes: 60,
    };

    const updatedAdminRow = {
      id: 'appt-1',
      customer_id: null,
      professional_id: 'pro-1',
      customer_name: 'Ana',
      customer_phone: '11999999999',
      start_time: '2099-01-15T09:00:00.000Z',
      end_time: '2099-01-15T10:30:00.000Z',
      status: 'CONFIRMED',
      booking_source: 'INTERNAL',
      total_duration_minutes: 90,
      total_price: 50,
      professionals: { name: 'João' },
      services: { name: 'Corte', duration_minutes: 60, price: 50 },
      appointment_services: [
        {
          service_id: 'svc-1',
          sort_order: 0,
          duration_minutes: 60,
          price: 50,
          services: { name: 'Corte' },
        },
      ],
    };

    function mockEditableAppointment(ctx: ReturnType<typeof buildService>) {
      const chain = createChainableQuery({ data: null, error: null });
      chain.maybeSingle.mockResolvedValue({
        data: existingAppointment,
        error: null,
      });
      chain.single.mockResolvedValue({ data: updatedAdminRow, error: null });
      ctx.from.mockReturnValue(chain);
      ctx.professionalHoursService.getEffectiveScheduleForDate.mockResolvedValue({
        isClosed: false,
        openAt: buildWallClockDateTime('2099-01-15', '08:00'),
        closeAt: buildWallClockDateTime('2099-01-15', '18:00'),
      });
      return chain;
    }

    it('updates the end time when the staff changes the duration', async () => {
      const ctx = buildService();
      const chain = mockEditableAppointment(ctx);

      const updated = await ctx.service.updateDurationForTenant(
        'tenant-1',
        'appt-1',
        90,
      );

      expect(chain.update).toHaveBeenCalledWith({
        end_time: '2099-01-15T10:30:00.000Z',
        total_duration_minutes: 90,
      });
      expect(updated.durationMinutes).toBe(90);
      expect(updated.endTime).toBe('2099-01-15T10:30:00.000Z');
    });

    it('does not write when the duration is already the stored value', async () => {
      const ctx = buildService();
      const chain = createChainableQuery({ data: updatedAdminRow, error: null });
      chain.maybeSingle
        .mockResolvedValueOnce({ data: existingAppointment, error: null })
        .mockResolvedValueOnce({
          data: {
            ...updatedAdminRow,
            end_time: '2099-01-15T10:00:00.000Z',
            total_duration_minutes: 60,
          },
          error: null,
        });
      ctx.from.mockReturnValue(chain);

      const current = await ctx.service.updateDurationForTenant(
        'tenant-1',
        'appt-1',
        60,
      );

      expect(chain.update).not.toHaveBeenCalled();
      expect(current.durationMinutes).toBe(60);
    });

    it('rejects duration changes that overlap another booking', async () => {
      const ctx = buildService();
      const chain = mockEditableAppointment(ctx);
      jest
        .spyOn(
          ctx.service as never as { hasBookingConflict: () => Promise<boolean> },
          'hasBookingConflict',
        )
        .mockResolvedValue(true);

      await expect(
        ctx.service.updateDurationForTenant('tenant-1', 'appt-1', 90),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(chain.update).not.toHaveBeenCalled();
    });

    it('rejects a duration that ends after the professional closes', async () => {
      const ctx = buildService();
      const chain = mockEditableAppointment(ctx);
      ctx.professionalHoursService.getEffectiveScheduleForDate.mockResolvedValue({
        isClosed: false,
        openAt: buildWallClockDateTime('2099-01-15', '08:00'),
        closeAt: buildWallClockDateTime('2099-01-15', '10:00'),
      });

      await expect(
        ctx.service.updateDurationForTenant('tenant-1', 'appt-1', 90),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(chain.update).not.toHaveBeenCalled();
    });

    it('still updates a booking that was already outside the professional schedule', async () => {
      const ctx = buildService();
      const chain = createChainableQuery({ data: null, error: null });
      chain.maybeSingle.mockResolvedValue({
        data: {
          ...existingAppointment,
          start_time: '2099-01-15T17:00:00.000Z',
          end_time: '2099-01-15T19:00:00.000Z',
          total_duration_minutes: 120,
        },
        error: null,
      });
      chain.single.mockResolvedValue({
        data: {
          ...updatedAdminRow,
          start_time: '2099-01-15T17:00:00.000Z',
          end_time: '2099-01-15T18:30:00.000Z',
          total_duration_minutes: 90,
        },
        error: null,
      });
      ctx.from.mockReturnValue(chain);
      ctx.professionalHoursService.getEffectiveScheduleForDate.mockResolvedValue({
        isClosed: false,
        openAt: buildWallClockDateTime('2099-01-15', '08:00'),
        closeAt: buildWallClockDateTime('2099-01-15', '18:00'),
      });

      await ctx.service.updateDurationForTenant('tenant-1', 'appt-1', 90);

      expect(chain.update).toHaveBeenCalledWith({
        end_time: '2099-01-15T18:30:00.000Z',
        total_duration_minutes: 90,
      });
    });

    it('rejects duration changes on finished appointments', async () => {
      const ctx = buildService();
      const chain = createChainableQuery({
        data: { ...existingAppointment, status: 'COMPLETED' },
        error: null,
      });
      ctx.from.mockReturnValue(chain);

      await expect(
        ctx.service.updateDurationForTenant('tenant-1', 'appt-1', 30),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(chain.update).not.toHaveBeenCalled();
    });

    it('blocks a professional from changing another agenda', async () => {
      const ctx = buildService();
      ctx.from.mockReturnValue(
        createChainableQuery({
          data: { ...existingAppointment, professional_id: 'pro-2' },
          error: null,
        }),
      );

      await expect(
        ctx.service.updateDurationForTenant('tenant-1', 'appt-1', 30, 'pro-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns not found when the appointment is outside the tenant', async () => {
      const ctx = buildService();
      ctx.from.mockReturnValue(
        createChainableQuery({ data: null, error: null }),
      );

      await expect(
        ctx.service.updateDurationForTenant('tenant-1', 'missing', 30),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('crons and deposit delegates', () => {
    it('delegates abandoned hold expiration', async () => {
      const { service, depositPaymentService } = buildService();
      depositPaymentService.expireAbandonedDepositHolds.mockResolvedValue(3);

      await expect(service.expireAbandonedDepositHolds()).resolves.toBe(3);
    });

    it('sends reminders only for confirmed appointments with email', async () => {
      const ctx = buildService();
      ctx.from.mockReturnValue(
        createChainableQuery({
          data: [
            {
              id: 'appt-1',
              customer_name: 'Ana',
              start_time: '2099-01-16T09:00:00.000Z',
              tenants: { id: 'tenant-1', name: 'Studio' },
              customers: { email: 'ana@example.com' },
              professionals: { name: 'João' },
              services: { name: 'Corte' },
              appointment_services: [],
            },
            {
              id: 'appt-2',
              customer_name: 'Bia',
              start_time: '2099-01-16T10:00:00.000Z',
              tenants: { id: 'tenant-1', name: 'Studio' },
              customers: { email: null },
              professionals: { name: 'João' },
              services: { name: 'Corte' },
              appointment_services: [],
            },
          ],
          error: null,
        }),
      );

      await ctx.service.sendDueAppointmentReminders();

      expect(ctx.mailService.sendAppointmentReminder).toHaveBeenCalledTimes(1);
      expect(ctx.mailService.sendAppointmentReminder).toHaveBeenCalledWith(
        expect.objectContaining({
          customerEmail: 'ana@example.com',
          customerName: 'Ana',
        }),
        expect.objectContaining({ id: 'tenant-1' }),
      );
    });
  });
});
