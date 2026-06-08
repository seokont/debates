import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { DebateEventsModule } from '../debate-events/debate-events.module';
import { DebateEngineModule } from '../debate-engine/debate-engine.module';
import { TelegramModule } from '../telegram/telegram.module';
import {
  BILLING_QUEUE,
  DEBATE_QUEUE,
  NOTIFICATION_QUEUE,
} from './debates.constants';
import { BillingProcessor } from './billing.processor';
import {
  CommentsController,
  DebatesController,
  InjectionsController,
} from './debates.controller';
import { DebatesProcessor } from './debates.processor';
import { DebatesService } from './debates.service';
import { NotificationsProcessor } from './notifications.processor';
import { UrlParserService } from './services/url-parser.service';

@Module({
  imports: [
    AuthModule,
    BillingModule,
    DebateEventsModule,
    DebateEngineModule,
    TelegramModule,
    BullModule.registerQueue(
      { name: DEBATE_QUEUE },
      { name: NOTIFICATION_QUEUE },
      { name: BILLING_QUEUE },
    ),
  ],
  controllers: [DebatesController, InjectionsController, CommentsController],
  providers: [
    DebatesService,
    DebatesProcessor,
    NotificationsProcessor,
    BillingProcessor,
    UrlParserService,
  ],
  exports: [DebatesService],
})
export class DebatesModule {}
