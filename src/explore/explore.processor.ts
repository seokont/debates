import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SessionStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { ExploreEventsService } from './explore-events.service';
import { EXPLORE_QUEUE, ExploreService, RUN_EXPLORE_JOB } from './explore.service';

type ExploreJobData = { sessionId: string; userId: string };

@Processor(EXPLORE_QUEUE)
export class ExploreProcessor extends WorkerHost {
  private readonly logger = new Logger(ExploreProcessor.name);

  constructor(
    private readonly exploreService: ExploreService,
    private readonly prisma: PrismaService,
    private readonly events: ExploreEventsService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    super();
  }

  async process(job: Job<ExploreJobData>) {
    if (job.name !== RUN_EXPLORE_JOB) return;

    const { sessionId, userId } = job.data;

    const session = await this.prisma.exploreSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) return;

    await this.prisma.exploreSession.update({
      where: { id: sessionId },
      data: { status: SessionStatus.RUNNING },
    });

    this.events.emit({
      type: 'SESSION_STARTED',
      sessionId,
      data: { question: session.question, mode: session.mode, type: session.exploreType },
    });

    try {
      let generation = 0;
      let budgetUsed = 0;
      let activePathIds: string[] = [];

      while (true) {
        generation++;
        this.logger.log(`Session ${sessionId}: generation ${generation}`);

        this.events.emit({
          type: 'GENERATION_STARTED',
          sessionId,
          data: { generation, activePaths: activePathIds.length },
        });

        const newPaths = await this.exploreService.generatePaths(
          sessionId,
          session.question,
          session.exploreType,
          generation,
          userId,
        );

        const createdPaths = await this.prisma.$transaction(
          newPaths.map((p) =>
            this.prisma.explorePath.create({
              data: p,
              select: { id: true, hypothesis: true, category: true, generatedBy: true },
            }),
          ),
        );

        await this.prisma.exploreSession.update({
          where: { id: sessionId },
          data: {
            totalPaths: { increment: createdPaths.length },
            generationsCount: generation,
          },
        });

        this.events.emit({
          type: 'PATHS_GENERATED',
          sessionId,
          data: { generation, count: createdPaths.length },
        });

        const scores = await this.exploreService.scorePaths(
          createdPaths,
          session.question,
          session.exploreType,
          userId,
        );

        await this.exploreService.updatePathScores(scores);

        const { active, pruned } = await this.exploreService.pruneByScore(sessionId, scores);
        activePathIds = active;

        await this.prisma.exploreSession.update({
          where: { id: sessionId },
          data: { prunedPaths: { increment: pruned.length } },
        });

        budgetUsed += newPaths.length * 0.005;
        await this.prisma.exploreSession.update({
          where: { id: sessionId },
          data: { budgetUsed },
        });

        this.events.emit({
          type: 'GENERATION_SCORED',
          sessionId,
          data: { generation, active: active.length, pruned: pruned.length, budgetUsed },
        });

        const stop = this.exploreService.shouldStop(
          generation,
          activePathIds,
          budgetUsed,
          session.budgetLimit,
        );
        if (stop.stop) {
          this.logger.log(`Session ${sessionId} stopping: ${stop.reason}`);
          break;
        }
      }

      await this.exploreService.markWinners(sessionId, generation);
      await this.prisma.exploreSession.update({
        where: { id: sessionId },
        data: { status: SessionStatus.COMPLETED, completedAt: new Date() },
      });

      this.events.emit({ type: 'SESSION_COMPLETED', sessionId, data: { generation } });
      this.eventEmitter.emit('explore.completed', { sessionId });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'unknown';
      this.logger.error(`Explore session ${sessionId} failed: ${msg}`);
      await this.prisma.exploreSession.update({
        where: { id: sessionId },
        data: { status: SessionStatus.FAILED },
      });
      this.events.emit({ type: 'SESSION_FAILED', sessionId, data: { reason: msg } });
    }
  }
}
