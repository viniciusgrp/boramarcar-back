import { buildTeamInviteAcceptUrl } from './team-invite-url.util';

describe('buildTeamInviteAcceptUrl', () => {
  it('joins origin and invite token without a trailing slash', () => {
    expect(
      buildTeamInviteAcceptUrl('https://hml.horariocerto.app/', 'abc+1'),
    ).toBe('https://hml.horariocerto.app/admin/login?invite=abc%2B1');
  });
});
