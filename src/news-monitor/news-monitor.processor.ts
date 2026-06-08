import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { NewsMonitorService } from './news-monitor.service';

export const NEWS_MONITOR_QUEUE = 'news-monitor';
export const RUN_MONITOR_JOB = 'run-monitor';

@Processor(NEWS_MONITOR_QUEUE)
export class NewsMonitorProcessor extends WorkerHost {
  private readonly logger = new Logger(NewsMonitorProcessor.name);

  constructor(private readonly newsMonitorService: NewsMonitorService) {
    super();
  }

  async process(job: Job) {
    if (job.name !== RUN_MONITOR_JOB) return;

    this.logger.log('Running news monitoring cycle...');
    const result = await this.newsMonitorService.runMonitoringCycle();
    this.logger.log(
      `News monitoring complete: created=${result.created} skipped=${result.skipped}`,
    );

    return result;
  }
}
