import { Injectable } from '@nestjs/common';
import { DebateStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AgentService } from './agent.service';
import { DebateMemoryService } from './debate-memory.service';
import { PromptBuilderService } from './prompt-builder.service';
import { StopConditionService } from './stop-condition.service';
import { ThesisImproverService } from './thesis-improver.service';
import { VerificationService } from './verification.service';
import { DebateAttack } from '../types/ai-agent.type';
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
      const events = await this.memory.getEvents(debateId);
      const agentResponses = await this.agentService.runAgents(
        debate.models,
        (agent) =>
          this.promptBuilder.buildAnchorPrompt(debate, events, agent.role),
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
}
