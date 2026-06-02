import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DEBATES_QUEUE } from './debates.constants';
import { DebatesController } from './debates.controller';
import { DebatesProcessor } from './debates.processor';
import { DebatesService } from './debates.service';

@Module({
  imports: [AuthModule, BullModule.registerQueue({ name: DEBATES_QUEUE })],
  controllers: [DebatesController],
  providers: [DebatesService, DebatesProcessor],
  exports: [DebatesService],
})
export class DebatesModule {}
