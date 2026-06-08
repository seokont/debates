import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DebateEngineModule } from '../debate-engine/debate-engine.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PatentDetectorProcessor } from './patent-detector.processor';
import { PATENT_QUEUE, PatentDetectorService } from './patent-detector.service';

@Module({
  imports: [
    PrismaModule,
    DebateEngineModule,
    BullModule.registerQueue({ name: PATENT_QUEUE }),
  ],
  providers: [PatentDetectorService, PatentDetectorProcessor],
  exports: [PatentDetectorService],
})
export class PatentDetectorModule {}
