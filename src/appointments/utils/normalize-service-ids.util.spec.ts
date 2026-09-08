import { normalizeServiceIds } from './normalize-service-ids.util';

describe('normalize-service-ids.util', () => {
  it('prefers the serviceIds array and deduplicates', () => {
    expect(
      normalizeServiceIds({
        serviceId: 'svc-ignored',
        serviceIds: [' svc-1 ', 'svc-1', 'svc-2', ''],
      }),
    ).toEqual(['svc-1', 'svc-2']);
  });

  it('falls back to a single serviceId', () => {
    expect(normalizeServiceIds({ serviceId: ' svc-1 ' })).toEqual(['svc-1']);
    expect(normalizeServiceIds({})).toEqual([]);
  });
});
