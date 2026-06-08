import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { ProfitPatternService } from './profit-pattern.service';

@Injectable()
export class CrossDomainService {
  private readonly logger = new Logger(CrossDomainService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly profitPatternService: ProfitPatternService,
  ) {}

  @OnEvent('debate.completed')
  handleDebateCompleted(payload: { debateId: string; userId: string }): void {
    this.runForCompletedDebate(payload.debateId, payload.userId).catch((err) =>
      this.logger.warn(`Cross-domain analysis failed for ${payload.debateId}: ${err.message}`),
    );
  }

  async runForCompletedDebate(debateId: string, userId?: string): Promise<void> {
    const debate = await this.prisma.debate.findUnique({
      where: { id: debateId },
      select: {
        id: true,
        currentThesis: true,
        researchGaps: true,
        opportunityScore: true,
      },
    });

    if (!debate || debate.opportunityScore === null) return;

    this.logger.log(`Running cross-domain analysis for debate ${debateId}`);

    await this.profitPatternService.analyzeForDebate(debateId, debate.currentThesis, userId);

    if (debate.researchGaps.length > 0) {
      await this.profitPatternService.findCrossdomainAnalogies(
        debateId,
        debate.currentThesis,
        debate.researchGaps,
        userId,
      );
    }
  }

  getInsightsForDebate(debateId: string) {
    return this.prisma.exploreInsight.findMany({
      where: { debateId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
