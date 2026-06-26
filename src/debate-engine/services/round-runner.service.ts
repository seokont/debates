import { Injectable } from '@nestjs/common';
import { DebateRound, DebateStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AgentService } from './agent.service';
import { DebateMemoryService } from './debate-memory.service';
import { CarryOverAttack, PromptBuilderService } from './prompt-builder.service';
import { StopConditionService } from './stop-condition.service';
import { ThesisImproverService } from './thesis-improver.service';
import { VerificationService } from './verification.service';
import { AiAgentRole, DebateAttack } from '../types/ai-agent.type';
import { RoundRunnerResult } from '../types/round-runner-result.type';

@Injectable()
export class RoundRunnerService {
  constructor(
    private readonly memory: DebateMemoryService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly agentService: AgentService,
    private readonly thesisImprover: ThesisImproverService,
    private readonly verificationService: VerificationService,
    private readonly stopConditionService: StopConditionService,
  ) {}

  async run(debateId: string): Promise<RoundRunnerResult> {
    const debate = await this.memory.getDebateOrThrow(debateId);

    if (debate.status !== DebateStatus.RUNNING) {
      throw new Error(`Debate ${debateId} is not running`);
    }

    const roundNumber = debate.roundCount + 1;
    const round = await this.memory.startRound(
      debateId,
      roundNumber,
      debate.currentThesis,
    );

    try {
      const [rounds, recentEvents, activeInjections] = await Promise.all([
        this.memory.getPreviousRounds(debateId),
        this.memory.getRecentEvents(debateId, 2),
        this.memory.getAcceptedInjections(debateId),
      ]);

      // Per spec: open attacks from previous round carry over — same model must continue its attack
      const carryOverByRole = this.buildCarryOverMap(rounds[rounds.length - 1] ?? null);

      const agentResponses = await this.agentService.runAgents(
        debate.models,
        (agent) =>
          this.promptBuilder.buildAnchorPrompt(
            debate,
            rounds,
            recentEvents,
            agent.role,
            activeInjections,
            carryOverByRole.get(agent.role) ?? null,
          ),
        debate.userId,
      );
      const attacks: DebateAttack[] = agentResponses.map((response) => ({
        id: randomUUID(),
        roundNumber,
        provider: response.provider,
        role: response.role,
        model: response.model,
        content: response.content,
      }));

      await this.memory.saveAttackEvents(debateId, round.id, attacks);

      const improvement = await this.thesisImprover.improve(
        debate,
        roundNumber,
        attacks,
        debate.userId,
      );

      const verifications = await this.verificationService.verify(
        attacks,
        improvement,
        debate.userId,
      );

      await this.memory.completeRound(
        debateId,
        round.id,
        improvement,
        attacks,
        verifications,
      );

      if (activeInjections.length > 0) {
        await this.memory.markInjectionsUsed(activeInjections.map((i) => i.id));
      }

      const recentScores = await this.memory.getRecentImprovementScores(
        debateId,
        3,
      );

      const stopCondition = this.stopConditionService.evaluate(
        debate,
        improvement,
        verifications,
        recentScores,
      );

      return {
        roundId: round.id,
        roundNumber,
        attacks,
        improvement,
        verifications,
        stopCondition,
      };
    } catch (error) {
      await this.memory.markRoundFailed(debateId, round.id, error);
      throw error;
    }
  }

  private buildCarryOverMap(
    lastRound: DebateRound | null,
  ): Map<AiAgentRole, CarryOverAttack> {
    const map = new Map<AiAgentRole, CarryOverAttack>();
    if (!lastRound?.openWeaknesses || !Array.isArray(lastRound.openWeaknesses)) {
      return map;
    }
    for (const item of lastRound.openWeaknesses as Array<Record<string, unknown>>) {
      const role = typeof item['role'] === 'string' ? (item['role'] as AiAgentRole) : null;
      const content = typeof item['content'] === 'string' ? item['content'] : null;
      if (role && content) {
        map.set(role, { role, content });
      }
    }
    return map;
  }
}
