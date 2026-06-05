import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DebateEventsModule } from '../debate-events/debate-events.module';
import {
  BILLING_QUEUE,
  DEBATE_QUEUE,
  NOTIFICATION_QUEUE,
} from '../debates/debates.constants';
import { PrismaModule } from '../prisma/prisma.module';
import { TelegramModule } from '../telegram/telegram.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    AuthModule,
    DebateEventsModule,
    PrismaModule,
    TelegramModule,
    BullModule.registerQueue(
      { name: DEBATE_QUEUE },
      { name: NOTIFICATION_QUEUE },
      { name: BILLING_QUEUE },
    ),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
