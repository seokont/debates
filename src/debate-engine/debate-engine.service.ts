import { Injectable, Logger } from '@nestjs/common';
import { AiAgentName, DebateEventType, DebateStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TelegramService } from '../telegram/telegram.service';
import { ConsiliumRunnerService } from './services/consilium-runner.service';
import { DebateFinalizationService } from './services/debate-finalization.service';
import { DebateMemoryService } from './services/debate-memory.service';
import { RoundRunnerService } from './services/round-runner.service';
import { RoundRunnerResult } from './types/round-runner-result.type';

/**
 * The minimum round count before consilium mode can be used.
 * Consilium runs 5 rounds internally, so maxRounds must be >= 5.
 */
const MIN_CONSILIUM_ROUNDS = 5;

@Injectable()
export class DebateEngineService {
  private readonly logger = new Logger(DebateEngineService.name);

  constructor(
    private readonly memory: DebateMemoryService,
    private readonly roundRunner: RoundRunnerService,
    private readonly consiliumRunner: ConsiliumRunnerService,
    private readonly telegramService: TelegramService,
    private readonly finalization: DebateFinalizationService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async startDebate(debateId: string): Promise<void> {
    try {
      const debate = await this.memory.getDebateOrThrow(debateId);

      if (
        debate.status === DebateStatus.COMPLETED ||
        debate.status === DebateStatus.CANCELLED
      ) {
        return;
      }

      await this.memory.markRunning(debateId);

      // Use consilium protocol when maxRounds >= 5 and all 4 models are present
      const useConsilium =
        debate.maxRounds >= MIN_CONSILIUM_ROUNDS &&
        debate.models.length >= 4;

      if (useConsilium) {
        await this.runConsiliumMode(debateId);
      } else {
        await this.runLinearMode(debateId);
      }
    } catch (error) {
      await this.failDebate(debateId, this.toError(error));
    }
  }

  /**
   * Linear mode — original loop: attack → improve → verify → check stop.
   * Used when fewer than 4 models or maxRounds < 5.
   */
  private async runLinearMode(debateId: string): Promise<void> {
    while (true) {
      const current = await this.memory.getDebateOrThrow(debateId);

      if (current.status !== DebateStatus.RUNNING) {
        return;
      }

      const result = await this.runNextRound(debateId);

      if (result.stopCondition.shouldStop) {
        await this.memory.createEvent(debateId, {
          type: DebateEventType.SYSTEM,
          agent: AiAgentName.SYSTEM,
          content: result.stopCondition.reason,
          roundId: result.roundId,
          metadata: {
            action: 'STOP_CONDITION_MET',
            roundNumber: result.roundNumber,
            reason: result.stopCondition.reason,
          },
        });
        await this.completeDebate(debateId);
        return;
      }
    }
  }

  /**
   * Consilium mode — 5-phase protocol per ТЗ Part 3:
   * 1. Independent positions (all 4 models, no knowledge of others)
   * 2. Cross-critique (each attacks the others)
   * 3. Synthesis (Claude collects what survived)
   * 4. Devil's advocate (Grok attacks the synthesis)
   * 5. Decision and plan (all models contribute)
   */
  private async runConsiliumMode(debateId: string): Promise<void> {
    await this.memory.createEvent(debateId, {
      type: DebateEventType.SYSTEM,
      agent: AiAgentName.SYSTEM,
      content: 'Starting consilium protocol (5 phases)',
      metadata: {
        action: 'CONSILIUM_STARTED',
      },
    });

    const result = await this.consiliumRunner.runConsilium(debateId);

    await this.memory.createEvent(debateId, {
      type: DebateEventType.SYSTEM,
      agent: AiAgentName.SYSTEM,
      content: 'Consilium protocol completed',
      roundId: result.roundId,
      metadata: {
        action: 'STOP_CONDITION_MET',
        roundNumber: result.roundNumber,
        reason: 'CONSILIUM_COMPLETE',
      },
    });

    await this.completeDebate(debateId);
  }

  runNextRound(debateId: string): Promise<RoundRunnerResult> {
    return this.roundRunner.run(debateId);
  }

  async completeDebate(debateId: string): Promise<void> {
    const debate = await this.memory.getDebateOrThrow(debateId);
    const events = await this.memory.getEvents(debateId);
    const attackCount = events.filter(
      (event) => event.type === DebateEventType.ATTACK,
    ).length;
    const verificationCount = events.filter(
      (event) => event.type === DebateEventType.VERIFICATION,
    ).length;
    const finalThesis = debate.currentThesis;
    const layer1Summary = `Layer 1 closed ${attackCount} attack events across ${debate.roundCount} rounds.`;
    const layer2Summary = `Layer 2 verified ${verificationCount} attack checks before finalizing the thesis.`;

    const finalization = await this.finalization.generate(
      debate,
      events,
      debate.userId,
    );

    const finalSummary = [
      `Debate completed after ${debate.roundCount} rounds.`,
      `Opportunity Score: ${finalization.opportunityScore}/100.`,
      this.getLastStopReason(events),
    ]
      .filter(Boolean)
      .join(' ');

    await this.memory.markCompleted(
      debateId,
      finalThesis,
      finalSummary,
      layer1Summary,
      layer2Summary,
      finalization,
    );
    await this.telegramService.notifyDebateCompleted(debateId);
    this.eventEmitter.emit('debate.completed', { debateId, userId: debate.userId });
  }

  async failDebate(debateId: string, error: Error): Promise<void> {
    this.logger.error(
      `Debate ${debateId} failed: ${error.message}`,
      error.stack,
    );

    await this.memory.markFailed(debateId, error);
    await this.telegramService.notifyDebateFailed(debateId, error.message);
  }

  private getLastStopReason(
    events: Awaited<ReturnType<DebateMemoryService['getEvents']>>,
  ): string {
    const stopEvent = [...events]
      .reverse()
      .find(
        (event) =>
          event.type === DebateEventType.SYSTEM &&
          this.getMetadataString(event.metadata, 'action') ===
            'STOP_CONDITION_MET',
      );

    if (!stopEvent) {
      return '';
    }

    const reason =
      this.getMetadataString(stopEvent.metadata, 'reason') || stopEvent.content;

    return reason ? `Stop reason: ${reason}.` : '';
  }

  private getMetadataString(metadata: unknown, key: string): string {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return '';
    }

    const value = (metadata as Record<string, unknown>)[key];

    return typeof value === 'string' ? value : '';
  }

  private toError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }

    return new Error('Unknown debate engine error');
  }
}
