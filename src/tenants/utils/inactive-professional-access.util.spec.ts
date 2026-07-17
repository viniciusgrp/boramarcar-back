import {
  canAccessPanelWithLinkedProfessional,
  shouldRevokePanelMembershipOnProfessionalArchive,
} from './inactive-professional-access.util';

describe('canAccessPanelWithLinkedProfessional', () => {
  it('allows any role when there is no linked professional', () => {
    expect(canAccessPanelWithLinkedProfessional('PROFESSIONAL', null)).toBe(
      true,
    );
    expect(canAccessPanelWithLinkedProfessional('ADMIN', null)).toBe(true);
    expect(canAccessPanelWithLinkedProfessional('OWNER', null)).toBe(true);
  });

  it('allows any role when the linked professional is not archived', () => {
    expect(canAccessPanelWithLinkedProfessional('PROFESSIONAL', false)).toBe(
      true,
    );
    expect(canAccessPanelWithLinkedProfessional('ADMIN', false)).toBe(true);
    expect(canAccessPanelWithLinkedProfessional('OWNER', false)).toBe(true);
  });

  it('blocks non-owner roles when the linked professional is archived', () => {
    expect(canAccessPanelWithLinkedProfessional('PROFESSIONAL', true)).toBe(
      false,
    );
    expect(canAccessPanelWithLinkedProfessional('ADMIN', true)).toBe(false);
  });

  it('keeps owner access when the linked professional is archived', () => {
    expect(canAccessPanelWithLinkedProfessional('OWNER', true)).toBe(true);
  });
});

describe('shouldRevokePanelMembershipOnProfessionalArchive', () => {
  it('revokes admin and professional memberships', () => {
    expect(
      shouldRevokePanelMembershipOnProfessionalArchive('ADMIN'),
    ).toBe(true);
    expect(
      shouldRevokePanelMembershipOnProfessionalArchive('PROFESSIONAL'),
    ).toBe(true);
  });

  it('keeps owner membership', () => {
    expect(
      shouldRevokePanelMembershipOnProfessionalArchive('OWNER'),
    ).toBe(false);
  });
});
