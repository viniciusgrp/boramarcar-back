import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { MailModule } from '../mail/mail.module';
import { NtfyModule } from '../notifications/ntfy.module';
import { ProfessionalAbsencesModule } from '../professional-absences/professional-absences.module';
import { ProfessionalsModule } from '../professionals/professionals.module';
import { TenantsModule } from '../tenants/tenants.module';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { SupportAssistantController } from './assistant/support-assistant.controller';
import { SupportAssistantService } from './assistant/support-assistant.service';
import { SupportAssistantRepository } from './assistant/support-assistant.repository';
import { SupportAssistantConfigService } from './assistant/support-assistant-config.service';
import { SupportAssistantQuotaService } from './assistant/support-assistant-quota.service';
import { SupportKnowledgeService } from './assistant/support-knowledge.service';
import { SupportAnalyticsSnapshotService } from './assistant/context/support-analytics-snapshot.service';
import { SupportAssistantActionsService } from './assistant/actions/support-assistant-actions.service';
import { SupportActionProposalStore } from './assistant/actions/support-action-proposal.store';
import { GeminiLlmProvider } from './assistant/llm/gemini-llm.provider';
import { GroqLlmProvider } from './assistant/llm/groq-llm.provider';
import { OpenAiLlmProvider } from './assistant/llm/openai-llm.provider';
import { llmProviderFactory } from './assistant/llm/llm-provider.factory';

@Module({
  imports: [
    AuthModule,
    TenantsModule,
    MailModule,
    NtfyModule,
    AppointmentsModule,
    ProfessionalAbsencesModule,
    ProfessionalsModule,
  ],
  controllers: [SupportController, SupportAssistantController],
  providers: [
    SupportService,
    SupportAssistantService,
    SupportAssistantRepository,
    SupportAssistantConfigService,
    SupportAssistantQuotaService,
    SupportKnowledgeService,
    SupportAnalyticsSnapshotService,
    SupportAssistantActionsService,
    SupportActionProposalStore,
    OpenAiLlmProvider,
    GroqLlmProvider,
    GeminiLlmProvider,
    llmProviderFactory,
  ],
})
export class SupportModule {}
