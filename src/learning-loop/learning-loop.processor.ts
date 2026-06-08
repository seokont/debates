import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { LearningLoopService } from './learning-loop.service';

export const LEARNING_LOOP_QUEUE = 'learning-loop';
export const RUN_LEARNING_LOOP_JOB = 'run-weekly';

@Processor(LEARNING_LOOP_QUEUE)
export class LearningLoopProcessor extends WorkerHost {
  private readonly logger = new Logger(LearningLoopProcessor.name);

  constructor(private readonly learningLoopService: LearningLoopService) {
    super();
  }

  async process(job: Job) {
    if (job.name !== RUN_LEARNING_LOOP_JOB) return;

    this.logger.log('Running weekly learning loop...');
    const result = await this.learningLoopService.runWeeklyCycle();
    this.logger.log(`Learning loop complete: patternsExtracted=${result.patternsExtracted}`);
    return result;
  }
}
