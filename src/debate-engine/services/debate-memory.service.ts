import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AiAgentName,
  AiAgentRole as PrismaAiAgentRole,
  Debate,
  DebateAiModel,
  DebateEvent,
  DebateEventType,
  DebateTier,
  DebateRound,
  DebateStatus,
  HumanInjection,
  InjectionStatus,
  Prisma,
  RoundStatus,
} from '@prisma/client';
import { DebateLiveEventsService } from '../../debate-events/debate-live-events.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AttackVerification,
  DebateAttack,
  ThesisImprovement,
} from '../types/ai-agent.type';

type DebateEventWrite = {
  type: DebateEventType;
  content: string;
  metadata?: Prisma.InputJsonValue;
  roundId?: string;
  agent?: AiAgentName;
  role?: PrismaAiAgentRole;
};

@Injectable()
export class DebateMemoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly liveEvents: DebateLiveEventsService,
  ) {}

  async getDebateOrThrow(debateId: string): Promise<Debate> {
    const debate = await this.prisma.debate.findUnique({
      where: { id: debateId },
    });

    if (!debate) {
      throw new NotFoundException('Debate not found');
    }

    return debate;
  }

  getPreviousRounds(debateId: string): Promise<DebateRound[]> {
    return this.prisma.debateRound.findMany({
      where: { debateId },
      orderBy: [{ roundNumber: 'asc' }, { startedAt: 'asc' }],
    });
  }

  async getRecentImprovementScores(
    debateId: string,
    count: number,
  ): Promise<(number | null)[]> {
    const rounds = await this.prisma.debateRound.findMany({
      where: { debateId, status: 'COMPLETED' },
      orderBy: { roundNumber: 'asc' },
      select: { improvementScore: true },
    });

    return rounds.slice(-count).map((r) => r.improvementScore);
  }

  getEvents(debateId: string): Promise<DebateEvent[]> {
    return this.prisma.debateEvent.findMany({
      where: { debateId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async markRunning(debateId: string): Promise<void> {
    const debate = await this.getDebateOrThrow(debateId);

    if (
      debate.status === DebateStatus.COMPLETED ||
      debate.status === DebateStatus.CANCELLED
    ) {
      return;
    }

    const [, event] = await this.prisma.$transaction([
      this.prisma.debate.update({
        where: { id: debateId },
        data: {
          status: DebateStatus.RUNNING,
          completedAt: null,
        },
      }),
      this.prisma.debateEvent.create({
        data: {
          debateId,
          type: DebateEventType.SYSTEM,
          agent: AiAgentName.SYSTEM,
          content: 'Debate started',
          metadata: {
            action: 'STARTED',
            previousStatus: debate.status,
            roundCount: debate.roundCount,
          },
        },
      }),
    ]);

    this.liveEvents.emit(event);
  }

  async startRound(
    debateId: string,
    roundNumber: number,
    inputThesis: string,
  ): Promise<DebateRound> {
    const { round, event } = await this.prisma.$transaction(async (tx) => {
      const round = await tx.debateRound.create({
        data: {
          debateId,
          roundNumber,
          inputThesis,
        },
      });

      const event = await tx.debateEvent.create({
        data: {
          debateId,
          roundId: round.id,
          type: DebateEventType.SYSTEM,
          agent: AiAgentName.SYSTEM,
          content: 'Round started',
          metadata: {
            action: 'ROUND_STARTED',
            roundNumber,
            inputThesis,
          },
        },
      });

      return { round, event };
    });

    this.liveEvents.emit(event);

    return round;
  }

  saveAttackEvents(
    debateId: string,
    roundId: string,
    attacks: DebateAttack[],
  ): Promise<void> {
    if (attacks.length === 0) {
      return Promise.resolve();
    }

    const writes = attacks.map((attack) =>
      this.prisma.debateEvent.create({
        data: {
          debateId,
          roundId,
          type: DebateEventType.ATTACK,
          agent: this.toAgentName(attack.model),
          role: attack.role,
          content: attack.content,
          metadata: {
            attackId: attack.id,
            roundNumber: attack.roundNumber,
            provider: attack.provider,
            model: attack.model,
          },
        },
      }),
    );

    return this.prisma.$transaction(writes).then((events) => {
      this.liveEvents.emitMany(events);
    });
  }

  async completeRound(
    debateId: string,
    roundId: string,
    improvement: ThesisImprovement,
    attacks: DebateAttack[],
    verifications: AttackVerification[],
  ): Promise<void> {
    const improvementScore = this.getImprovementScore(verifications);
    const writes: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.debateRound.update({
        where: { id: roundId },
        data: {
          status: RoundStatus.COMPLETED,
          outputThesis: improvement.improvedThesis,
          closedAttacks: this.buildAttackSnapshot(attacks, verifications, true),
          openWeaknesses: this.buildAttackSnapshot(
            attacks,
            verifications,
            false,
          ),
          improvementScore,
          completedAt: new Date(),
        },
      }),
      this.prisma.debate.update({
        where: { id: debateId },
        data: {
          currentThesis: improvement.improvedThesis,
          roundCount: improvement.roundNumber,
        },
      }),
      this.prisma.debateEvent.create({
        data: {
          debateId,
          roundId,
          type: DebateEventType.IMPROVEMENT,
          agent: AiAgentName.SYSTEM,
          role: PrismaAiAgentRole.IMPROVER,
          content: improvement.improvedThesis,
          metadata: {
            roundNumber: improvement.roundNumber,
            previousThesis: improvement.previousThesis,
            summary: improvement.summary,
            changed: improvement.changed,
          },
        },
      }),
      ...verifications.map((verification) =>
        this.prisma.debateEvent.create({
          data: {
            debateId,
            roundId,
            type: DebateEventType.VERIFICATION,
            agent: AiAgentName.SYSTEM,
            role: PrismaAiAgentRole.VERIFIER,
            content: verification.reason,
            metadata: {
              attackId: verification.attackId,
              roundNumber: verification.roundNumber,
              provider: verification.provider,
              targetRole: verification.role,
              model: verification.model,
              status: verification.status,
              closed: verification.closed,
              confidence: verification.confidence,
            },
          },
        }),
      ),
      this.prisma.debateEvent.create({
        data: {
          debateId,
          roundId,
          type: DebateEventType.SYSTEM,
          agent: AiAgentName.SYSTEM,
          content: 'Round completed',
          metadata: {
            action: 'ROUND_COMPLETED',
            roundNumber: improvement.roundNumber,
            improvementScore,
          },
        },
      }),
    ];

    const results = await this.prisma.$transaction(writes);
    const events = results.filter((result): result is DebateEvent =>
      this.isDebateEvent(result),
    );

    this.liveEvents.emitMany(events);
  }

  async markRoundFailed(
    debateId: string,
    roundId: string,
    error: unknown,
  ): Promise<void> {
    const reason = error instanceof Error ? error.message : 'Unknown error';

    const [, event] = await this.prisma.$transaction([
      this.prisma.debateRound.update({
        where: { id: roundId },
        data: {
          status: RoundStatus.FAILED,
          completedAt: new Date(),
          openWeaknesses: [{ reason }],
        },
      }),
      this.prisma.debateEvent.create({
        data: {
          debateId,
          roundId,
          type: DebateEventType.SYSTEM,
          agent: AiAgentName.SYSTEM,
          content: reason,
          metadata: {
            action: 'ROUND_FAILED',
            reason,
          },
        },
      }),
    ]);

    this.liveEvents.emit(event);
  }

  getAcceptedInjections(debateId: string): Promise<HumanInjection[]> {
    return this.prisma.humanInjection.findMany({
      where: { debateId, status: InjectionStatus.ACCEPTED },
      orderBy: { acceptedAt: 'asc' },
    });
  }

  async markInjectionsUsed(injectionIds: string[]): Promise<void> {
    if (injectionIds.length === 0) return;

    await this.prisma.humanInjection.updateMany({
      where: { id: { in: injectionIds } },
      data: { status: InjectionStatus.USED_IN_ROUND },
    });
  }

  createEvent(
    debateId: string,
    event: DebateEventWrite,
  ): Promise<DebateEvent> {
    return this.prisma.debateEvent.create({
      data: {
        debateId,
        roundId: event.roundId,
        type: event.type,
        agent: event.agent,
        role: event.role,
        content: event.content,
        metadata: event.metadata,
      },
    }).then((createdEvent) => {
      this.liveEvents.emit(createdEvent);

      return createdEvent;
    });
  }

  private buildAttackSnapshot(
    attacks: DebateAttack[],
    verifications: AttackVerification[],
    closed: boolean,
  ): Prisma.InputJsonValue {
    const verificationByAttackId = new Map(
      verifications.map((verification) => [
        verification.attackId,
        verification,
      ]),
    );

    return attacks
      .filter((attack) => {
        const verification = verificationByAttackId.get(attack.id);

        return closed
          ? verification?.status === 'closed'
          : verification?.status !== 'closed';
      })
      .map((attack) => {
        const verification = verificationByAttackId.get(attack.id);

        return {
          attackId: attack.id,
          roundNumber: attack.roundNumber,
          provider: attack.provider,
          role: attack.role,
          model: attack.model,
          content: attack.content,
          ...(verification
            ? {
                status: verification.status,
                reason: verification.reason,
                confidence: verification.confidence,
              }
            : {}),
        };
      }) as Prisma.InputJsonValue;
  }

  private getImprovementScore(
    verifications: AttackVerification[],
  ): number | null {
    if (verifications.length === 0) {
      return null;
    }

    let score = 0;
    for (const verification of verifications) {
      if (verification.status === 'closed') score += 1;
      else if (verification.status === 'partially') score += 0.5;
    }

    return score / verifications.length;
  }

  private toAgentName(model: DebateAiModel): AiAgentName {
    switch (model) {
      case DebateAiModel.GPT:
        return AiAgentName.GPT;
      case DebateAiModel.CLAUDE:
        return AiAgentName.CLAUDE;
      case DebateAiModel.GEMINI:
        return AiAgentName.GEMINI;
      case DebateAiModel.GROK:
        return AiAgentName.GROK;
    }
  }

  private computeTier(debate: Debate, events: DebateEvent[]): DebateTier {
    const rounds = debate.roundCount;
    const hasHumanInjection = events.some(
      (e) =>
        e.type === DebateEventType.HUMAN &&
        this.isAcceptedInjection(e.metadata),
    );

    if (rounds >= 10 && hasHumanInjection) {
      return DebateTier.DEEP;
    }

    if (rounds >= 6 && hasHumanInjection) {
      return DebateTier.VERIFIED;
    }

    if (rounds >= 6) {
      return DebateTier.VERIFIED;
    }

    return DebateTier.SURFACE;
  }

  private isAcceptedInjection(metadata: unknown): boolean {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return false;
    }
    const meta = metadata as Record<string, unknown>;
    return meta['action'] === 'HUMAN_INJECTION_ACCEPTED';
  }

  private isDebateEvent(value: unknown): value is DebateEvent {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    const candidate = value as Partial<DebateEvent>;

    return (
      typeof candidate.id === 'string' &&
      typeof candidate.debateId === 'string' &&
      typeof candidate.type === 'string' &&
      typeof candidate.content === 'string' &&
      candidate.createdAt instanceof Date
    );
  }

  async markCompleted(
    debateId: string,
    finalThesis: string,
    finalSummary: string,
    layer1Summary: string,
    layer2Summary: string,
    finalization?: {
      opportunityScore: number;
      childQuestions: string[];
      researchGaps: string[];
      crossDomainHypotheses: string[];
    },
  ): Promise<void> {
    const debate = await this.getDebateOrThrow(debateId);
    const events = await this.getEvents(debateId);
    const tier = this.computeTier(debate, events);

    const [, event] = await this.prisma.$transaction([
      this.prisma.debate.update({
        where: { id: debateId },
        data: {
          status: DebateStatus.COMPLETED,
          tier,
          finalThesis,
          finalSummary,
          layer1Summary,
          layer2Summary,
          completedAt: new Date(),
          ...(finalization
            ? {
                opportunityScore: finalization.opportunityScore,
                childQuestions: finalization.childQuestions,
                researchGaps: finalization.researchGaps,
                crossDomainHypotheses: finalization.crossDomainHypotheses,
              }
            : {}),
        },
      }),
      this.prisma.debateEvent.create({
        data: {
          debateId,
          type: DebateEventType.FINAL,
          agent: AiAgentName.SYSTEM,
          content: finalSummary,
          metadata: {
            action: 'COMPLETED',
            finalThesis,
            layer1Summary,
            layer2Summary,
          },
        },
      }),
    ]);

    this.liveEvents.emit(event);
  }

  async markFailed(debateId: string, error: Error): Promise<void> {
    const debate = await this.prisma.debate.findUnique({
      where: { id: debateId },
      select: { id: true, status: true },
    });

    if (
      !debate ||
      debate.status === DebateStatus.COMPLETED ||
      debate.status === DebateStatus.CANCELLED
    ) {
      return;
    }

    const [, event] = await this.prisma.$transaction([
      this.prisma.debate.update({
        where: { id: debateId },
        data: { status: DebateStatus.FAILED },
      }),
      this.prisma.debateEvent.create({
        data: {
          debateId,
          type: DebateEventType.SYSTEM,
          agent: AiAgentName.SYSTEM,
          content: error.message,
          metadata: {
            action: 'FAILED',
            reason: error.message,
            name: error.name,
          },
        },
      }),
    ]);

    this.liveEvents.emit(event);
  }
}
