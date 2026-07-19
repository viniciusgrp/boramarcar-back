import type { ConfigService } from '@nestjs/config';
import { SupportAssistantConfigService } from './support-assistant-config.service';

function buildConfig(env: Record<string, string | undefined>) {
  const configService = {
    get: (key: string) => env[key],
  } as unknown as ConfigService;
  return new SupportAssistantConfigService(configService);
}

describe('SupportAssistantConfigService', () => {
  it('defaults provider to openai with gpt-4o-mini', () => {
    const config = buildConfig({});
    expect(config.getProvider()).toBe('openai');
    expect(config.getModel()).toBe('gpt-4o-mini');
  });

  it('uses groq defaults when provider is groq', () => {
    const config = buildConfig({ SUPPORT_AI_PROVIDER: 'groq' });
    expect(config.getProvider()).toBe('groq');
    expect(config.getModel()).toBe('llama-3.3-70b-versatile');
  });

  it('uses gemini defaults when provider is gemini', () => {
    const config = buildConfig({ SUPPORT_AI_PROVIDER: 'gemini' });
    expect(config.getProvider()).toBe('gemini');
    expect(config.getModel()).toBe('gemini-2.5-flash');
  });

  it('respects explicit model override', () => {
    const config = buildConfig({
      SUPPORT_AI_PROVIDER: 'openai',
      SUPPORT_AI_MODEL: 'gpt-4o',
    });
    expect(config.getModel()).toBe('gpt-4o');
  });
});
