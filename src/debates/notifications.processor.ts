import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  TelegramNotificationJobData,
  TelegramService,
} from '../telegram/telegram.service';
import {
  NOTIFICATION_QUEUE,
  SEND_NOTIFICATION_JOB,
} from './debates.constants';

@Processor(NOTIFICATION_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(private readonly telegramService: TelegramService) {
    super();
  }

  async process(job: Job<TelegramNotificationJobData>) {
    if (job.name !== SEND_NOTIFICATION_JOB) {
      return;
    }

    const result = await this.telegramService.sendNotification(job.data);
    this.logger.log(
      `Telegram notification ${job.data.trigger}: ${result.sent}/${result.total} sent`,
    );
  }
}
