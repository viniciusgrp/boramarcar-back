import type { ConfigService } from '@nestjs/config';
import { NtfyService } from './ntfy.service';

function buildService(env: Record<string, string | undefined>) {
  const configService = {
    get: (key: string) => env[key],
  } as unknown as ConfigService;

  return new NtfyService(configService);
}

describe('NtfyService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('does not call fetch when NTFY_TOPIC is empty', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const service = buildService({ NTFY_TOPIC: '' });
    await service.notifyNewTenant({
      name: 'Barbearia Z',
      slug: 'barbearia-z',
      ownerEmail: 'dono@example.com',
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts to the default ntfy server with title and body', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const service = buildService({ NTFY_TOPIC: 'boramarcar-test' });
    await service.notifyNewTenant({
      name: 'Barbearia Z',
      slug: 'barbearia-z',
      ownerEmail: 'dono@example.com',
    });

    expect(fetchMock).toHaveBeenCalledWith('https://ntfy.sh/boramarcar-test', {
      method: 'POST',
      headers: {
        Title: 'Novo estabelecimento',
        Priority: '4',
        Tags: 'office,tada',
      },
      body: 'Nome: Barbearia Z\nSlug: barbearia-z\nE-mail: dono@example.com',
    });
  });

  it('uses NTFY_SERVER when provided and strips trailing slash', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const service = buildService({
      NTFY_TOPIC: 'alerts',
      NTFY_SERVER: 'https://ntfy.example.com/',
    });
    await service.notifyNewTenant({ name: 'Studio', slug: 'studio' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://ntfy.example.com/alerts',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('does not throw when fetch rejects', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    const service = buildService({ NTFY_TOPIC: 'boramarcar-test' });

    await expect(
      service.notifyNewTenant({ name: 'X', slug: 'x' }),
    ).resolves.toBeUndefined();
  });

  it('does not throw when response is not ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    }) as unknown as typeof fetch;

    const service = buildService({ NTFY_TOPIC: 'boramarcar-test' });

    await expect(
      service.notifyNewTenant({ name: 'X', slug: 'x' }),
    ).resolves.toBeUndefined();
  });

  it('notifies support needs-human with the user question', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const service = buildService({ NTFY_TOPIC: 'boramarcar-test' });
    await service.notifySupportNeedsHuman({
      tenantName: 'Barbearia Z',
      tenantId: 'tenant-1',
      userRole: 'Dono',
      userEmail: 'dono@example.com',
      question: 'Como estornar um sinal pago ontem?',
    });

    expect(fetchMock).toHaveBeenCalledWith('https://ntfy.sh/boramarcar-test', {
      method: 'POST',
      headers: {
        Title: 'Suporte IA: precisa de humano',
        Priority: '4',
        Tags: 'warning,speech_balloon',
      },
      body: expect.stringContaining('Pergunta: Como estornar um sinal pago ontem?'),
    });
  });
});
