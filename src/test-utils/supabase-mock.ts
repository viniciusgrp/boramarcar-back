export type SupabaseQueryResult<T> = {
  data: T;
  error: { code?: string; message: string } | null;
};

export interface ChainableQueryMock {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  upsert: jest.Mock;
  delete: jest.Mock;
  eq: jest.Mock;
  neq: jest.Mock;
  in: jest.Mock;
  is: jest.Mock;
  gte: jest.Mock;
  lte: jest.Mock;
  lt: jest.Mock;
  gt: jest.Mock;
  or: jest.Mock;
  order: jest.Mock;
  limit: jest.Mock;
  maybeSingle: jest.Mock;
  single: jest.Mock;
  then: jest.Mock;
}

export function createChainableQuery(
  result: SupabaseQueryResult<unknown> = { data: null, error: null },
): ChainableQueryMock {
  const api = {} as ChainableQueryMock;

  const chain = () => api;

  api.select = jest.fn(chain);
  api.insert = jest.fn(chain);
  api.update = jest.fn(chain);
  api.upsert = jest.fn(chain);
  api.delete = jest.fn(chain);
  api.eq = jest.fn(chain);
  api.neq = jest.fn(chain);
  api.in = jest.fn(chain);
  api.is = jest.fn(chain);
  api.gte = jest.fn(chain);
  api.lte = jest.fn(chain);
  api.lt = jest.fn(chain);
  api.gt = jest.fn(chain);
  api.or = jest.fn(chain);
  api.order = jest.fn(chain);
  api.limit = jest.fn(chain);
  api.maybeSingle = jest.fn(async () => result);
  api.single = jest.fn(async () => result);
  api.then = jest.fn((resolve: (value: SupabaseQueryResult<unknown>) => unknown) =>
    Promise.resolve(result).then(resolve),
  );

  return api;
}

export function createSupabaseServiceMock(options?: {
  from?: jest.Mock;
  authGetUser?: jest.Mock;
}) {
  const from =
    options?.from ??
    jest.fn(() => createChainableQuery({ data: null, error: null }));

  const authGetUser =
    options?.authGetUser ??
    jest.fn(async () => ({ data: { user: null }, error: { message: 'invalid' } }));

  return {
    from,
    getClient: () => ({
      from,
      auth: {
        getUser: authGetUser,
      },
    }),
  };
}
