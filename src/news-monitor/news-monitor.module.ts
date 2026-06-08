import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Queue } from 'bullmq';
import { DebateEngineModule } from '../debate-engine/debate-engine.module';
import { DebatesModule } from '../debates/debates.module';
import { PrismaModule } from '../prisma/prisma.module';
import {
  NEWS_MONITOR_QUEUE,
  NewsMonitorProcessor,
  RUN_MONITOR_JOB,
} from './news-monitor.processor';
import { NewsMonitorService } from './news-monitor.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    DebateEngineModule,
    DebatesModule,
    BullModule.registerQueue({ name: NEWS_MONITOR_QUEUE }),
  ],
  providers: [NewsMonitorService, NewsMonitorProcessor],
})
export class NewsMonitorModule implements OnModuleInit {
  constructor(
    @InjectQueue(NEWS_MONITOR_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    await this.queue.add(
      RUN_MONITOR_JOB,
      {},
      {
        repeat: { pattern: '0 * * * *' },
        jobId: 'news-monitor-hourly',
        removeOnComplete: 10,
        removeOnFail: 20,
      },
    );
  }
}
