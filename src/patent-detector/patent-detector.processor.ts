import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DETECT_PATENTS_JOB, PATENT_QUEUE, PatentDetectorService } from './patent-detector.service';

@Processor(PATENT_QUEUE)
export class PatentDetectorProcessor extends WorkerHost {
  private readonly logger = new Logger(PatentDetectorProcessor.name);

  constructor(private readonly patentDetectorService: PatentDetectorService) {
    super();
  }

  async process(job: Job<{ debateId: string; userId: string }>) {
    if (job.name !== DETECT_PATENTS_JOB) return;
    this.logger.log(`Detecting patent opportunities for debate ${job.data.debateId}`);
    await this.patentDetectorService.detectForDebate(job.data.debateId, job.data.userId);
  }
}
