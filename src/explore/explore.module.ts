import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DebateEngineModule } from '../debate-engine/debate-engine.module';
import { DebatesModule } from '../debates/debates.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ExploreController } from './explore.controller';
import { ExploreEventsService } from './explore-events.service';
import { ExploreProcessor } from './explore.processor';
import { EXPLORE_QUEUE, ExploreService } from './explore.service';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    DebateEngineModule,
    DebatesModule,
    BullModule.registerQueue({ name: EXPLORE_QUEUE }),
  ],
  controllers: [ExploreController],
  providers: [ExploreService, ExploreProcessor, ExploreEventsService],
  exports: [ExploreService],
})
export class ExploreModule {}
