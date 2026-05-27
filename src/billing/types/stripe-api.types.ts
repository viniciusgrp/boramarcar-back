import type StripeSdk from 'stripe';

export type StripeClient = InstanceType<typeof StripeSdk>;

export type StripeEvent = ReturnType<
  StripeClient['webhooks']['constructEvent']
>;

export type StripeCheckoutSession = Extract<
  StripeEvent['data']['object'],
  { object: 'checkout.session' }
>;

export type StripeSubscription = Extract<
  StripeEvent['data']['object'],
  { object: 'subscription' }
>;

export type StripeSubscriptionStatus = StripeSubscription['status'];
