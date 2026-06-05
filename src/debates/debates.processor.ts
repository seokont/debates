import { Processor, WorkerHost } from '@nestjs/bullmq';
import { DebateStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { DebateEngineService } from '../debate-engine/debate-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEBATE_QUEUE,
  GENERATE_FINAL_SUMMARY_JOB,
  RUN_DEBATE_JOB,
  RUN_ROUND_JOB,
} from './debates.constants';
import { DebateJobData } from './types/debate-job-data.type';

@Processor(DEBATE_QUEUE)
export class DebatesProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly debateEngine: DebateEngineService,
  ) {
    super();
  }

  async process(job: Job<DebateJobData>) {
    const debate = await this.prisma.debate.findUnique({
      where: { id: job.data.debateId },
      select: { id: true, status: true },
    });

    if (!debate || debate.status === DebateStatus.CANCELLED) {
      return;
    }

    switch (job.name) {
      case RUN_DEBATE_JOB:
        await this.debateEngine.startDebate(debate.id);
        return;
      case RUN_ROUND_JOB:
        await this.debateEngine.runNextRound(debate.id);
        return;
      case GENERATE_FINAL_SUMMARY_JOB:
        await this.debateEngine.completeDebate(debate.id);
        return;
      default:
        return;
    }
  }
}
