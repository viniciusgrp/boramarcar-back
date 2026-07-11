export interface InitialSetupStatus {
  checklistVersion: number;
  isComplete: boolean;
  isPersistedComplete: boolean;
  hasProfessional: boolean;
  hasService: boolean;
  hasBranding: boolean;
  hasVisitedSettings: boolean;
  hasCustomerAccountPolicy: boolean;
  hasStripeConnect: boolean;
  requiresStripeConnect: boolean;
}
