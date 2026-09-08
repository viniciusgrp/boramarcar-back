import { parseServiceIdsQuery } from './parse-service-ids.util';

describe('parse-service-ids.util', () => {
  it('collects a single serviceId', () => {
    expect(parseServiceIdsQuery(' svc-1 ')).toEqual(['svc-1']);
  });

  it('parses comma-separated query strings', () => {
    expect(parseServiceIdsQuery(undefined, 'svc-1, svc-2,svc-1')).toEqual([
      'svc-1',
      'svc-2',
    ]);
  });

  it('parses an array of ids', () => {
    expect(parseServiceIdsQuery('svc-1', ['svc-2', ' svc-1 '])).toEqual([
      'svc-1',
      'svc-2',
    ]);
  });
});
