export interface InitialSetupStatus {
  checklistVersion: number;
  isComplete: boolean;
  isPersistedComplete: boolean;
  hasProfessional: boolean;
  hasService: boolean;
  hasBranding: boolean;
  hasBusinessHours: boolean;
  hasContactPhone: boolean;
  hasVisitedSettings: boolean;
  hasSharedBookingLink: boolean;
  hasCustomerAccountPolicy: boolean;
  hasStripeConnect: boolean;
  requiresStripeConnect: boolean;
  hasActiveSubscription: boolean;
}
