import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Module, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { DebateEngineModule } from '../debate-engine/debate-engine.module';
import { PrismaModule } from '../prisma/prisma.module';
import {
  LEARNING_LOOP_QUEUE,
  LearningLoopProcessor,
  RUN_LEARNING_LOOP_JOB,
} from './learning-loop.processor';
import { LearningLoopService } from './learning-loop.service';

@Module({
  imports: [
    PrismaModule,
    DebateEngineModule,
    BullModule.registerQueue({ name: LEARNING_LOOP_QUEUE }),
  ],
  providers: [LearningLoopService, LearningLoopProcessor],
  exports: [LearningLoopService],
})
export class LearningLoopModule implements OnModuleInit {
  constructor(
    @InjectQueue(LEARNING_LOOP_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    await this.queue.add(
      RUN_LEARNING_LOOP_JOB,
      {},
      {
        repeat: { pattern: '0 6 * * 1' },
        jobId: 'learning-loop-weekly',
        removeOnComplete: 5,
        removeOnFail: 10,
      },
    );
  }
}
