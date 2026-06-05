import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { BILLING_QUEUE } from './debates.constants';

@Processor(BILLING_QUEUE)
export class BillingProcessor extends WorkerHost {
  private readonly logger = new Logger(BillingProcessor.name);

  async process(job: Job) {
    this.logger.warn(`Unsupported billing job ignored: ${job.name}`);
  }
}
