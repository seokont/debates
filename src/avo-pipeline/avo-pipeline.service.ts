import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ExploreType, SessionMode } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { BuildRoomService } from '../build-room/build-room.service';
import { ExploreService } from '../explore/explore.service';
import { InvestorEngineService } from '../investor-engine/investor-engine.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AvoPipelineService {
  private readonly logger = new Logger(AvoPipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly exploreService: ExploreService,
    private readonly buildRoomService: BuildRoomService,
    private readonly investorEngineService: InvestorEngineService,
  ) {}

  @OnEvent('debate.completed')
  async handleDebateCompleted(payload: { debateId: string; userId: string }): Promise<void> {
    const debate = await this.prisma.debate.findUnique({
      where: { id: payload.debateId },
      select: { opportunityScore: true, currentThesis: true },
    });

    if (!debate || (debate.opportunityScore ?? 0) < 80) return;

    this.logger.log(`AVO pipeline triggered for debate ${payload.debateId} (score=${debate.opportunityScore})`);

    try {
      const session = await this.exploreService.create(
        { id: payload.userId } as AuthenticatedUser,
        {
          question: `Find startup ideas based on: ${debate.currentThesis}`,
          mode: SessionMode.EXPLORE,
          exploreType: ExploreType.STARTUPS,
          budgetLimit: 7,
        },
      );

      await this.prisma.exploreInsight.create({
        data: {
          debateId: payload.debateId,
          sessionId: session.sessionId,
          type: 'AVO_TRIGGERED',
          content: `AVO pipeline started: Explore session ${session.sessionId} launched`,
          metadata: { pipelineSource: payload.debateId },
        },
      });

      this.logger.log(`AVO: Explore session ${session.sessionId} started for debate ${payload.debateId}`);
    } catch (error) {
      this.logger.warn(
        `AVO pipeline failed at Explore for ${payload.debateId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  @OnEvent('explore.completed')
  async handleExploreCompleted(payload: { sessionId: string }): Promise<void> {
    const session = await this.prisma.exploreSession.findUnique({
      where: { id: payload.sessionId },
      include: {
        paths: {
          where: { status: 'WINNER' },
          orderBy: { score: 'desc' },
          take: 1,
        },
        insights: {
          where: { type: 'AVO_TRIGGERED' },
          take: 1,
        },
      },
    });

    if (!session?.insights.length || !session.paths.length) return;

    const topPath = session.paths[0];
    if ((topPath.score ?? 0) < 80) return;

    const debateInsight = session.insights[0];
    const metadata = debateInsight.metadata as Record<string, unknown> | null;
    const debateId = metadata?.['pipelineSource'] as string | undefined;
    if (!debateId) return;

    this.logger.log(`AVO: top path score=${topPath.score} — triggering Build Room for debate ${debateId}`);

    try {
      const project = await this.buildRoomService.create(
        { id: session.userId } as AuthenticatedUser,
        { debateId },
      );

      this.logger.log(`AVO: Build Room project ${project.projectId} created`);
    } catch (error) {
      this.logger.warn(
        `AVO pipeline failed at Build Room: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  @OnEvent('build.completed')
  async handleBuildCompleted(payload: {
    projectId: string;
    userId: string;
    passed: boolean;
  }): Promise<void> {
    if (!payload.passed) return;

    this.logger.log(`AVO: build passed, running investor matching for project ${payload.projectId}`);

    try {
      await this.investorEngineService.findInvestors(payload.projectId, payload.userId);
      this.logger.log(`AVO: investor matching complete for project ${payload.projectId}`);
    } catch (error) {
      this.logger.warn(
        `AVO investor matching failed for ${payload.projectId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }
}
