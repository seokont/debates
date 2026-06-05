import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NOTIFICATION_QUEUE } from '../debates/debates.constants';
import { PrismaModule } from '../prisma/prisma.module';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    BullModule.registerQueue({ name: NOTIFICATION_QUEUE }),
  ],
  controllers: [TelegramController],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
