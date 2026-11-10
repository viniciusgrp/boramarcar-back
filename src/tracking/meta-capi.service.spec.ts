import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MetaCapiService } from './meta-capi.service';

describe('MetaCapiService', () => {
  let service: MetaCapiService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetaCapiService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                META_PIXEL_ID: '1556427229547864',
                META_CAPI_ACCESS_TOKEN: 'test_token',
              };
              return config[key];
            }),
          },
        },
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

  describe('sendCompleteRegistration', () => {
    it('should call sendEvent with proper parameters', async () => {
      const sendEventSpy = jest.spyOn(service, 'sendEvent').mockResolvedValue();

      await service.sendCompleteRegistration({
        email: 'test@example.com',
        userId: 'user123',
        clientIpAddress: '192.168.1.1',
        clientUserAgent: 'Mozilla/5.0',
        eventId: 'event123',
        fbp: 'fb.1.123456789.987654321',
        fbc: 'fb.1.123456789.click123',
      });

      expect(sendEventSpy).toHaveBeenCalledWith({
        eventName: 'CompleteRegistration',
        eventTime: expect.any(Number),
        eventSourceUrl: 'https://horariocerto.app/register',
        eventId: 'event123',
        userData: {
          email: 'test@example.com',
          externalId: 'user123',
          clientIpAddress: '192.168.1.1',
          clientUserAgent: 'Mozilla/5.0',
          fbp: 'fb.1.123456789.987654321',
          fbc: 'fb.1.123456789.click123',
        },
        customData: {
          currency: 'BRL',
          value: 0,
        },
      });
    });

    it('should build fbc from fbclid if fbc not provided', async () => {
      const sendEventSpy = jest.spyOn(service, 'sendEvent').mockResolvedValue();

      await service.sendCompleteRegistration({
        email: 'test@example.com',
        userId: 'user123',
        fbclid: 'click123',
        firstVisitAt: '2026-11-10T19:00:00.000Z',
      });

      expect(sendEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userData: expect.objectContaining({
            fbc: expect.stringMatching(/^fb\.1\.\d+\.click123$/),
          }),
        }),
      );
    });
  });
});
