import {
  buildBookingRedeemDescription,
  buildStandaloneRedeemDescription,
  isBookingRedeemDescription,
  isCompletionEarnDescription,
  isRedeemRefundDescription,
  isRewardRedeemDescription,
  LOYALTY_COMPLETION_EARN_DESCRIPTION,
  LOYALTY_REFUND_REDEEM_DESCRIPTION,
  LOYALTY_RESTORE_REDEEM_DESCRIPTION,
} from './loyalty-ledger.constants';

describe('loyalty-ledger.constants', () => {
  it('builds and detects booking redeem descriptions', () => {
    const description = buildBookingRedeemDescription('Corte grátis');
    expect(isBookingRedeemDescription(description)).toBe(true);
    expect(isRewardRedeemDescription(description)).toBe(true);
    expect(isBookingRedeemDescription(buildStandaloneRedeemDescription('X'))).toBe(
      false,
    );
  });

  it('detects restore and refund ledger rows', () => {
    expect(isRewardRedeemDescription(LOYALTY_RESTORE_REDEEM_DESCRIPTION)).toBe(
      true,
    );
    expect(isRedeemRefundDescription(LOYALTY_REFUND_REDEEM_DESCRIPTION)).toBe(
      true,
    );
    expect(
      isCompletionEarnDescription(LOYALTY_COMPLETION_EARN_DESCRIPTION),
    ).toBe(true);
    expect(isRedeemRefundDescription(LOYALTY_COMPLETION_EARN_DESCRIPTION)).toBe(
      false,
    );
  });
});
