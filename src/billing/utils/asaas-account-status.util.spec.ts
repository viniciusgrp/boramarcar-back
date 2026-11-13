import { mapAsaasAccountStatusUpdate } from './asaas-account-status.util';

describe('mapAsaasAccountStatusUpdate', () => {
  it('matches the general-approval webhook', () => {
    expect(
      mapAsaasAccountStatusUpdate({
        eventType: 'ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED',
      }),
    ).toEqual({
      asaasChargesEnabled: true,
      asaasDetailsSubmitted: true,
      asaasAccountStatus: 'APPROVED',
    });
  });

  it('does not enable charges when only documents are approved', () => {
    expect(
      mapAsaasAccountStatusUpdate({
        eventType: 'ACCOUNT_STATUS_DOCUMENT_APPROVED',
        general: 'PENDING',
        documentation: 'APPROVED',
        commercialInfo: 'APPROVED',
        bankAccountInfo: 'PENDING',
      }),
    ).toEqual({ asaasDetailsSubmitted: true });
  });

  it('maps a myAccount status snapshot the same way', () => {
    expect(
      mapAsaasAccountStatusUpdate({
        general: 'APPROVED',
        commercialInfo: 'APPROVED',
        bankAccountInfo: 'APPROVED',
        documentation: 'APPROVED',
      }),
    ).toEqual({
      asaasChargesEnabled: true,
      asaasDetailsSubmitted: true,
      asaasAccountStatus: 'APPROVED',
    });

    expect(
      mapAsaasAccountStatusUpdate({
        general: 'REJECTED',
        commercialInfo: 'REJECTED',
        bankAccountInfo: 'PENDING',
        documentation: 'REJECTED',
      }),
    ).toEqual({
      asaasChargesEnabled: false,
      asaasDetailsSubmitted: false,
      asaasAccountStatus: 'REJECTED',
    });

    expect(
      mapAsaasAccountStatusUpdate({
        general: 'PENDING',
        commercialInfo: 'AWAITING_APPROVAL',
        bankAccountInfo: 'PENDING',
        documentation: 'PENDING',
      }),
    ).toBeNull();
  });
});
