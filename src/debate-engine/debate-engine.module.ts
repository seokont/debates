import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DebateEventsModule } from '../debate-events/debate-events.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { TelegramModule } from '../telegram/telegram.module';
import { AgentService } from './services/agent.service';
import { DebateMemoryService } from './services/debate-memory.service';
import { PromptBuilderService } from './services/prompt-builder.service';
import { RoundRunnerService } from './services/round-runner.service';
import { StopConditionService } from './services/stop-condition.service';
import { ThesisImproverService } from './services/thesis-improver.service';
import { VerificationService } from './services/verification.service';
import { DebateEngineService } from './debate-engine.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    DebateEventsModule,
    SettingsModule,
    TelegramModule,
  ],
  providers: [
    AgentService,
    DebateEngineService,
    DebateMemoryService,
    PromptBuilderService,
    RoundRunnerService,
    StopConditionService,
    ThesisImproverService,
    VerificationService,
  ],
  exports: [DebateEngineService],
})
export class DebateEngineModule {}
