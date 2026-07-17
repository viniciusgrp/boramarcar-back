import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { MailModule } from '../mail/mail.module';

import { TenantsModule } from '../tenants/tenants.module';

import { SupportController } from './support.controller';

import { SupportService } from './support.service';

import { SupportAssistantController } from './assistant/support-assistant.controller';

import { SupportAssistantService } from './assistant/support-assistant.service';

import { SupportAssistantRepository } from './assistant/support-assistant.repository';

import { SupportAssistantConfigService } from './assistant/support-assistant-config.service';

import { SupportAssistantQuotaService } from './assistant/support-assistant-quota.service';

import { SupportKnowledgeService } from './assistant/support-knowledge.service';

import { GeminiLlmProvider } from './assistant/llm/gemini-llm.provider';



@Module({

  imports: [AuthModule, TenantsModule, MailModule],

  controllers: [SupportController, SupportAssistantController],

  providers: [

    SupportService,

    SupportAssistantService,

    SupportAssistantRepository,

    SupportAssistantConfigService,

    SupportAssistantQuotaService,

    SupportKnowledgeService,

    GeminiLlmProvider,

  ],

})

export class SupportModule {}


