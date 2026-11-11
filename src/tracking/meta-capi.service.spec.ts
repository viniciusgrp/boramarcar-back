import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MetaCapiService } from './meta-capi.service';

describe('MetaCapiService', () => {
  let service: MetaCapiService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfigService.get.mockReturnValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetaCapiService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<MetaCapiService>(MetaCapiService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('buildFbc', () => {
    it('should build fbc from fbclid and firstVisitAt', () => {
      const fbclid = 'test_click_id';
      const firstVisitAt = '2026-11-10T19:00:00.000Z';
      const result = service.buildFbc(fbclid, firstVisitAt);

      expect(result).toBeDefined();
      expect(result).toMatch(/^fb\.1\.\d+\.test_click_id$/);
    });

    it('should build fbc with current timestamp if firstVisitAt not provided', () => {
      const fbclid = 'test_click_id';
      const result = service.buildFbc(fbclid);

      expect(result).toBeDefined();
      expect(result).toMatch(/^fb\.1\.\d+\.test_click_id$/);
    });

    it('should return undefined if fbclid is empty', () => {
      const result = service.buildFbc('');
      expect(result).toBeUndefined();
    });
  });

  describe('configuration', () => {
    it('should skip sending events when not configured', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      const logSpy = jest.spyOn(service['logger'], 'log');
      await service.sendCompleteRegistration({
        email: 'test@example.com',
        userId: 'user123',
      });

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Meta Conversions API not configured'),
      );
    });

    it('should skip when only pixelId is configured', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'META_PIXEL_ID') return '1556427229547864';
        return undefined;
      });

      const newModule = await Test.createTestingModule({
        providers: [
          MetaCapiService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const newService = newModule.get<MetaCapiService>(MetaCapiService);
      const logSpy = jest.spyOn(newService['logger'], 'log');

      await newService.sendCompleteRegistration({
        email: 'test@example.com',
        userId: 'user123',
      });

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Meta Conversions API not configured'),
      );
    });

    it('should skip when only accessToken is configured', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'META_CAPI_ACCESS_TOKEN') return 'test_token';
        return undefined;
      });

      const newModule = await Test.createTestingModule({
        providers: [
          MetaCapiService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const newService = newModule.get<MetaCapiService>(MetaCapiService);
      const logSpy = jest.spyOn(newService['logger'], 'log');

      await newService.sendCompleteRegistration({
        email: 'test@example.com',
        userId: 'user123',
      });

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Meta Conversions API not configured'),
      );
    });
  });

  describe('email normalization and hashing', () => {
    it('should normalize email to lowercase and trim spaces', () => {
      const email = '  Test@Example.COM  ';
      const normalized = service['normalizeEmail'](email);
      expect(normalized).toBe('test@example.com');
    });

    it('should hash normalized email with SHA-256', () => {
      const email = 'test@example.com';
      const hashed = service['hashSha256'](email);
      expect(hashed).toBe(
        '973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b',
      );
    });
  });

  describe('phone normalization and hashing', () => {
    it('should normalize phone by removing non-digits', () => {
      const phone = '+55 (11) 98765-4321';
      const normalized = service['normalizePhone'](phone);
      expect(normalized).toBe('5511987654321');
    });

    it('should prepend 55 if not present', () => {
      const phone = '11987654321';
      const normalized = service['normalizePhone'](phone);
      expect(normalized).toBe('5511987654321');
    });

    it('should not prepend 55 if already present', () => {
      const phone = '5511987654321';
      const normalized = service['normalizePhone'](phone);
      expect(normalized).toBe('5511987654321');
    });

    it('should hash normalized phone with SHA-256', () => {
      const phone = '5511987654321';
      const hashed = service['hashSha256'](phone);
      expect(hashed).toBe(
        '029c7290f14c4516673508635f0519db95f7daf42057fd0e4ad1de84c5408a66',
      );
    });
  });

  describe('sendEvent', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should not call fetch when not configured', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      await service.sendCompleteRegistration({
        email: 'test@example.com',
        userId: 'user123',
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should send event with fbclid and build fbc when provided', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'META_PIXEL_ID') return '1556427229547864';
        if (key === 'META_CAPI_ACCESS_TOKEN') return 'test_token';
        return undefined;
      });

      const newModule = await Test.createTestingModule({
        providers: [
          MetaCapiService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const newService = newModule.get<MetaCapiService>(MetaCapiService);

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
      });

      await newService.sendCompleteRegistration({
        email: 'test@example.com',
        userId: 'user123',
        fbclid: 'click123',
        firstVisitAt: '2026-11-10T19:00:00.000Z',
      });

      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.data[0].user_data.fbc).toMatch(/^fb\.1\.\d+\.click123$/);
    });

    it('should send event with correct payload when configured', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'META_PIXEL_ID') return '1556427229547864';
        if (key === 'META_CAPI_ACCESS_TOKEN') return 'test_token';
        return undefined;
      });

      const newModule = await Test.createTestingModule({
        providers: [
          MetaCapiService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const newService = newModule.get<MetaCapiService>(MetaCapiService);

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
      });

      await newService.sendCompleteRegistration({
        email: 'test@example.com',
        userId: 'user123',
        clientIpAddress: '192.168.1.1',
        clientUserAgent: 'Mozilla/5.0',
        eventId: 'evt123',
        fbp: 'fb.1.1234567890.1234567890',
        fbc: 'fb.1.1234567890.AbCdEfGhIjKlMnOpQrStUvWxYz',
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://graph.facebook.com/v21.0/1556427229547864/events?access_token=test_token',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }),
      );

      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.data).toHaveLength(1);
      expect(body.data[0].event_name).toBe('CompleteRegistration');
      expect(body.data[0].action_source).toBe('website');
      expect(body.data[0].event_source_url).toBe(
        'https://horariocerto.app/register',
      );
      expect(body.data[0].event_id).toBe('evt123');
      expect(body.data[0].user_data.em).toBe(
        '973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b',
      );
      expect(body.data[0].user_data.external_id).toBeDefined();
      expect(body.data[0].user_data.client_ip_address).toBe('192.168.1.1');
      expect(body.data[0].user_data.client_user_agent).toBe('Mozilla/5.0');
      expect(body.data[0].user_data.fbp).toBe('fb.1.1234567890.1234567890');
      expect(body.data[0].user_data.fbc).toBe(
        'fb.1.1234567890.AbCdEfGhIjKlMnOpQrStUvWxYz',
      );
      expect(body.data[0].custom_data).toEqual({
        currency: 'BRL',
        value: 0,
      });
    });

    it('should include test_event_code when configured', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'META_PIXEL_ID') return '1556427229547864';
        if (key === 'META_CAPI_ACCESS_TOKEN') return 'test_token';
        if (key === 'META_CAPI_TEST_EVENT_CODE') return 'TEST12345';
        return undefined;
      });

      const newModule = await Test.createTestingModule({
        providers: [
          MetaCapiService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const newService = newModule.get<MetaCapiService>(MetaCapiService);

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
      });

      await newService.sendCompleteRegistration({
        email: 'test@example.com',
        userId: 'user123',
      });

      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.test_event_code).toBe('TEST12345');
    });

    it('should not throw when fetch fails', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'META_PIXEL_ID') return '1556427229547864';
        if (key === 'META_CAPI_ACCESS_TOKEN') return 'test_token';
        return undefined;
      });

      const newModule = await Test.createTestingModule({
        providers: [
          MetaCapiService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const newService = newModule.get<MetaCapiService>(MetaCapiService);

      (global.fetch as jest.Mock).mockRejectedValue(
        new Error('Network error'),
      );

      const warnSpy = jest.spyOn(newService['logger'], 'warn');

      await expect(
        newService.sendCompleteRegistration({
          email: 'test@example.com',
          userId: 'user123',
        }),
      ).resolves.not.toThrow();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Network error'),
      );
    });

    it('should log warning when API returns non-OK status', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'META_PIXEL_ID') return '1556427229547864';
        if (key === 'META_CAPI_ACCESS_TOKEN') return 'test_token';
        return undefined;
      });

      const newModule = await Test.createTestingModule({
        providers: [
          MetaCapiService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const newService = newModule.get<MetaCapiService>(MetaCapiService);

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => '{"error": "Invalid request"}',
      });

      const warnSpy = jest.spyOn(newService['logger'], 'warn');

      await newService.sendCompleteRegistration({
        email: 'test@example.com',
        userId: 'user123',
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Meta CAPI event failed with status 400'),
      );
    });

    it('should generate UUID for event_id when not provided', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'META_PIXEL_ID') return '1556427229547864';
        if (key === 'META_CAPI_ACCESS_TOKEN') return 'test_token';
        return undefined;
      });

      const newModule = await Test.createTestingModule({
        providers: [
          MetaCapiService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const newService = newModule.get<MetaCapiService>(MetaCapiService);

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
      });

      await newService.sendCompleteRegistration({
        email: 'test@example.com',
        userId: 'user123',
      });

      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.data[0].event_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });
  });
});
