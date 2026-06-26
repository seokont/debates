import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ExploreType, PathStatus, SessionMode } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AgentService } from '../debate-engine/services/agent.service';
import { PrismaService } from '../prisma/prisma.service';
import { ModeDetectionService } from '../debates/services/mode-detection.service';
import { CreateExploreDto } from './dto/create-explore.dto';
import { InjectPathDto } from './dto/inject-path.dto';

export const EXPLORE_QUEUE = 'explore';
export const RUN_EXPLORE_JOB = 'run-explore';
const MAX_GENERATIONS = 5;
const MAX_ACTIVE_PATHS = 5;

@Injectable()
export class ExploreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentService: AgentService,
    private readonly modeDetection: ModeDetectionService,
    @InjectQueue(EXPLORE_QUEUE) private readonly exploreQueue: Queue,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateExploreDto) {
    const detected = this.modeDetection.detect(dto.question);
    const mode =
      dto.mode ?? (detected.mode === 'QUANTUM' ? SessionMode.QUANTUM : SessionMode.EXPLORE);
    const exploreType = dto.exploreType ?? detected.exploreType ?? ExploreType.STARTUPS;

    const session = await this.prisma.exploreSession.create({
      data: {
        userId: user.id,
        question: dto.question.trim(),
        exploreType,
        mode,
        budgetLimit: dto.budgetLimit ?? 10,
      },
    });

    await this.exploreQueue.add(
      RUN_EXPLORE_JOB,
      { sessionId: session.id, userId: user.id },
      {
        jobId: `explore:${session.id}`,
        attempts: 2,
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );

    return { sessionId: session.id, mode, exploreType };
  }

  async findOne(id: string, userId?: string) {
    const session = await this.prisma.exploreSession.findFirst({
      where: { id, ...(userId ? { userId } : {}) },
      include: {
        paths: {
          orderBy: [{ generation: 'asc' }, { score: 'desc' }],
        },
        insights: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!session) throw new NotFoundException('Explore session not found');
    return session;
  }

  findAll(userId: string) {
    return this.prisma.exploreSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        question: true,
        mode: true,
        exploreType: true,
        status: true,
        generationsCount: true,
        totalPaths: true,
        prunedPaths: true,
        budgetUsed: true,
        completedAt: true,
        createdAt: true,
      },
    });
  }

  async injectPath(sessionId: string, user: AuthenticatedUser, dto: InjectPathDto) {
    const session = await this.prisma.exploreSession.findFirst({
      where: { id: sessionId },
      select: { id: true, status: true, generationsCount: true },
    });

    if (!session) throw new NotFoundException('Session not found');
    if (session.status !== 'RUNNING' && session.status !== 'PAUSED') {
      throw new BadRequestException('Session is not active');
    }

    return this.prisma.explorePath.create({
      data: {
        sessionId,
        generation: session.generationsCount,
        hypothesis: dto.hypothesis.trim(),
        generatedBy: `HUMAN:${user.id}`,
        status: PathStatus.ACTIVE,
      },
    });
  }

  async generatePaths(
    sessionId: string,
    question: string,
    exploreType: ExploreType,
    generation: number,
    userId?: string,
  ) {
    const count = this.getPathCountForType(exploreType);
    const categories = this.getCategoriesForType(exploreType);
    const pathsPerModel = Math.ceil(count / 4);
    const models = ['anthropic', 'openai', 'google', 'xai'] as const;
    const allPaths: Array<{ hypothesis: string; category: string; model: string }> = [];

    for (const [i, model] of models.entries()) {
      const category = categories[i % categories.length];

      const prompt = [
        `You are generating hypotheses for: "${question}"`,
        `Type: ${exploreType}. Category: ${category}`,
        ``,
        `Generate exactly ${pathsPerModel} distinct, specific hypotheses in this category.`,
        `Each hypothesis must be falsifiable and actionable.`,
        ``,
        `Format — one per line, starting with number:`,
        `1. [hypothesis text]`,
        `2. [hypothesis text]`,
        `...`,
        ``,
        `Do not add explanations. Just the numbered list.`,
      ].join('\n');

      try {
        const response = await this.agentService.callProvider(model as any, prompt, userId);
        const lines = response.split('\n').filter((l) => /^\d+\./.test(l.trim()));
        for (const line of lines.slice(0, pathsPerModel)) {
          const text = line.replace(/^\d+\.\s*/, '').trim();
          if (text.length > 10) {
            allPaths.push({ hypothesis: text, category, model });
          }
        }
      } catch {
        // continue with other models
      }
    }

    return allPaths.map((p) => ({
      sessionId,
      generation,
      hypothesis: p.hypothesis,
      category: p.category,
      generatedBy: p.model,
    }));
  }

  /**
   * Cross-model scoring: each provider scores paths it did NOT generate.
   * Every path receives up to 3 independent scores; final = average.
   * This eliminates self-promotion bias per spec Block I2.
   */
  async scorePaths(
    paths: Array<{ id: string; hypothesis: string; category: string | null; generatedBy: string }>,
    question: string,
    exploreType: ExploreType,
    userId?: string,
  ): Promise<Map<string, number>> {
    const providers = ['anthropic', 'openai', 'google', 'xai'] as const;
    const accumulated = new Map<string, number[]>();
    for (const p of paths) accumulated.set(p.id, []);

    // Run all 4 providers concurrently; each scores paths it didn't generate
    await Promise.all(
      providers.map(async (scorer) => {
        const toScore = paths.filter((p) => !p.generatedBy.startsWith(scorer));
        if (toScore.length === 0) return;

        const scores = await this.scoreWithProvider(scorer, toScore, question, exploreType, userId);
        for (const [id, score] of scores) {
          accumulated.get(id)?.push(score);
        }
      }),
    );

    const result = new Map<string, number>();
    for (const [id, scores] of accumulated) {
      result.set(
        id,
        scores.length > 0
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : 50,
      );
    }
    return result;
  }

  private async scoreWithProvider(
    provider: 'anthropic' | 'openai' | 'google' | 'xai',
    paths: Array<{ id: string; hypothesis: string; category: string | null }>,
    question: string,
    exploreType: ExploreType,
    userId?: string,
  ): Promise<Map<string, number>> {
    const scores = new Map<string, number>();
    const scoringCriteria = this.getScoringCriteria(exploreType);
    const batchSize = 10;

    for (let i = 0; i < paths.length; i += batchSize) {
      const batch = paths.slice(i, i + batchSize);
      const prompt = [
        `Score these hypotheses for: "${question}" (type: ${exploreType})`,
        ``,
        `Criteria: ${scoringCriteria}`,
        ``,
        `For each hypothesis output: ID: [id] SCORE: [0-100]`,
        ``,
        ...batch.map((p) => `[${p.id}] ${p.hypothesis}`),
        ``,
        `Output format (one per line):`,
        `ID: <id> SCORE: <number>`,
      ].join('\n');

      try {
        const response = await this.agentService.callProvider(provider as any, prompt, userId);
        for (const line of response.split('\n')) {
          const match = line.match(/ID:\s*([a-f0-9-]+)\s+SCORE:\s*(\d+)/i);
          if (match) {
            scores.set(match[1], Math.min(100, parseInt(match[2], 10)));
          }
        }
      } catch {
        for (const p of batch) scores.set(p.id, 50);
      }
    }

    return scores;
  }

  async pruneByScore(
    sessionId: string,
    scores: Map<string, number>,
  ): Promise<{ active: string[]; pruned: string[] }> {
    const active: string[] = [];
    const pruned: string[] = [];

    for (const [pathId, score] of scores.entries()) {
      if (score < 50) {
        pruned.push(pathId);
      } else {
        active.push(pathId);
      }
    }

    const sortedActive = active
      .map((id) => ({ id, score: scores.get(id) ?? 0 }))
      .sort((a, b) => b.score - a.score);

    const keptActive = sortedActive.slice(0, MAX_ACTIVE_PATHS).map((p) => p.id);
    const overflow = sortedActive.slice(MAX_ACTIVE_PATHS).map((p) => p.id);

    await this.prisma.explorePath.updateMany({
      where: { id: { in: [...pruned, ...overflow] }, sessionId },
      data: { status: PathStatus.PRUNED },
    });

    await this.prisma.explorePath.updateMany({
      where: { id: { in: keptActive }, sessionId },
      data: { status: PathStatus.ACTIVE },
    });

    return { active: keptActive, pruned: [...pruned, ...overflow] };
  }

  async updatePathScores(scores: Map<string, number>): Promise<void> {
    for (const [pathId, score] of scores.entries()) {
      await this.prisma.explorePath.update({
        where: { id: pathId },
        data: { score },
      });
    }
  }

  async markWinners(sessionId: string, generation: number): Promise<void> {
    const topPaths = await this.prisma.explorePath.findMany({
      where: { sessionId, status: PathStatus.ACTIVE, generation },
      orderBy: { score: 'desc' },
      take: 3,
    });

    if (topPaths.length > 0) {
      await this.prisma.explorePath.updateMany({
        where: { id: { in: topPaths.map((p) => p.id) } },
        data: { status: PathStatus.WINNER },
      });
    }
  }

  shouldStop(
    generation: number,
    activePaths: string[],
    budgetUsed: number,
    budgetLimit: number,
  ): { stop: boolean; reason: string } {
    if (generation >= MAX_GENERATIONS) return { stop: true, reason: 'MAX_GENERATIONS' };
    if (budgetUsed >= budgetLimit) return { stop: true, reason: 'BUDGET_LIMIT' };
    if (activePaths.length === 0) return { stop: true, reason: 'NO_ACTIVE_PATHS' };
    return { stop: false, reason: '' };
  }

  private getPathCountForType(type: ExploreType): number {
    switch (type) {
      case ExploreType.STARTUPS:
        return 32;
      case ExploreType.SCIENCE:
        return 40;
      case ExploreType.SOLUTIONS:
        return 40;
      case ExploreType.ANOMALY:
        return 32;
    }
  }

  private getCategoriesForType(type: ExploreType): string[] {
    switch (type) {
      case ExploreType.STARTUPS:
        return ['Profit Patterns', 'Cross-domain analogies', 'Latent behavior', 'Contrarian hypotheses'];
      case ExploreType.SCIENCE:
        return ['Biochemical mechanisms', 'Neurological pathways', 'Immune mechanisms', 'Epigenetic factors'];
      case ExploreType.SOLUTIONS:
        return ['Medical interventions', 'Systemic/policy', 'Technological', 'Behavioral'];
      case ExploreType.ANOMALY:
        return ['Structural causes', 'Cultural factors', 'Economic incentives', 'Industry specifics'];
    }
  }

  private getScoringCriteria(type: ExploreType): string {
    switch (type) {
      case ExploreType.STARTUPS:
        return 'Market size + hidden demand + analogous success (0-100)';
      case ExploreType.SCIENCE:
        return 'Evidence alignment + falsifiability + explanatory power + novelty (0-100)';
      case ExploreType.SOLUTIONS:
        return 'Feasibility + impact scale + cost + analogous success (0-100)';
      case ExploreType.ANOMALY:
        return 'Survival under attack + predictive power + consistency with known facts (0-100)';
    }
  }
}
