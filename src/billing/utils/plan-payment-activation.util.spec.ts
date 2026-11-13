import {
  isAsaasSubscriptionCurrentlyActive,
  isCourtesyPlan,
  paymentBelongsToCurrentAsaasSubscription,
} from './plan-payment-activation.util';

describe('plan payment activation guard', () => {
  it('treats comp_until as the complimentary plan marker', () => {
    expect(isCourtesyPlan({ comp_until: '2027-01-01T00:00:00.000Z' })).toBe(
      true,
    );
    expect(isCourtesyPlan({ comp_until: '  ' })).toBe(false);
    expect(isCourtesyPlan({ comp_until: null })).toBe(false);
  });

  it('matches only the subscription currently stored on the tenant', () => {
    expect(
      paymentBelongsToCurrentAsaasSubscription(
        { asaas_subscription_id: 'sub_current' },
        'sub_current',
      ),
    ).toBe(true);
    expect(
      paymentBelongsToCurrentAsaasSubscription(
        { asaas_subscription_id: 'sub_current' },
        'sub_old',
      ),
    ).toBe(false);
    expect(
      paymentBelongsToCurrentAsaasSubscription(
        { asaas_subscription_id: null },
        'sub_old',
      ),
    ).toBe(false);
  });

  it('treats a deleted or inactive Asaas subscription as not active', () => {
    expect(
      isAsaasSubscriptionCurrentlyActive({ status: 'ACTIVE', deleted: false }),
    ).toBe(true);
    expect(
      isAsaasSubscriptionCurrentlyActive({ status: 'ACTIVE', deleted: true }),
    ).toBe(false);
    expect(isAsaasSubscriptionCurrentlyActive({ status: 'DELETED' })).toBe(
      false,
    );
    expect(isAsaasSubscriptionCurrentlyActive({ status: 'INACTIVE' })).toBe(
      false,
    );
  });
});
