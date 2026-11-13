/**
 * Welcome is immediate, but it must wait until the establishment email is
 * confirmed. Other steps keep their signup and trial anchors.
 */
export function shouldDeferWelcomeUntilOwnerEmailConfirmed(params: {
  stepKey: string;
  ownerEmailConfirmed: boolean;
}): boolean {
  return params.stepKey === 'welcome' && !params.ownerEmailConfirmed;
}
