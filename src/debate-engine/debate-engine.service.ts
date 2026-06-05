import { Injectable, Logger } from '@nestjs/common';
import { AiAgentName, DebateEventType, DebateStatus } from '@prisma/client';
import { TelegramService } from '../telegram/telegram.service';
import { DebateMemoryService } from './services/debate-memory.service';
import { RoundRunnerService } from './services/round-runner.service';
import { RoundRunnerResult } from './types/round-runner-result.type';

@Injectable()
export class DebateEngineService {
  private readonly logger = new Logger(DebateEngineService.name);

  constructor(
    private readonly memory: DebateMemoryService,
    private readonly roundRunner: RoundRunnerService,
    private readonly telegramService: TelegramService,
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
    } catch (error) {
      await this.failDebate(debateId, this.toError(error));
    }
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
    const finalSummary = [
      `Debate completed after ${debate.roundCount} rounds.`,
      `Final thesis length: ${finalThesis.length} characters.`,
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
    );
    await this.telegramService.notifyDebateCompleted(debateId);
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
