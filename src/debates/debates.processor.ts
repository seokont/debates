import { Processor, WorkerHost } from '@nestjs/bullmq';
import { DebateStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { DEBATES_QUEUE, RUN_DEBATE_JOB } from './debates.constants';
import { DebateJobData } from './types/debate-job-data.type';

@Processor(DEBATES_QUEUE)
export class DebatesProcessor extends WorkerHost {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<DebateJobData>) {
    if (job.name !== RUN_DEBATE_JOB) {
      return;
    }

    const debate = await this.prisma.debate.findUnique({
      where: { id: job.data.debateId },
      select: { id: true, status: true },
    });

    if (!debate || debate.status === DebateStatus.CANCELLED) {
      return;
    }

    await this.prisma.$transaction([
      this.prisma.debate.update({
        where: { id: debate.id },
        data: { status: DebateStatus.RUNNING },
      }),
      this.prisma.debateEvent.create({
        data: {
          debateId: debate.id,
          type: 'STARTED',
          payload: {
            jobId: job.id,
            restart: job.data.restart,
          },
        },
      }),
    ]);
  }
}
