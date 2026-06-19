import { Injectable, Logger } from '@nestjs/common';
import { DebateStatus, AiAgentName, DebateEventType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AgentService } from './agent.service';
import { DebateMemoryService } from './debate-memory.service';
import { PromptBuilderService } from './prompt-builder.service';
import { ThesisImproverService } from './thesis-improver.service';
import { VerificationService } from './verification.service';
import { DebateAttack, AiAgentRole } from '../types/ai-agent.type';
import { RoundRunnerResult } from '../types/round-runner-result.type';

/**
 * Consilium protocol — 5-phase debate as specified in ТЗ Part 3.
 *
 * Phase 1 — Independent positions: Each model without knowledge of others.
 * Phase 2 — Cross-critique: Each model attacks the positions of the others.
 * Phase 3 — Synthesis: Claude collects what survived, forms a unified position.
 * Phase 4 — Devil's advocate: Grok attacks the synthesis.
 * Phase 5 — Decision and plan: What to do, what is needed from humans, success criteria.
 */

export type ConsiliumPhase =
  | 'INDEPENDENT'
  | 'CROSS_CRITIQUE'
  | 'SYNTHESIS'
  | 'DEVILS_ADVOCATE'
  | 'DECISION';

const CONSILIUM_PHASES: ConsiliumPhase[] = [
  'INDEPENDENT',
  'CROSS_CRITIQUE',
  'SYNTHESIS',
  'DEVILS_ADVOCATE',
  'DECISION',
];

@Injectable()
export class ConsiliumRunnerService {
  private readonly logger = new Logger(ConsiliumRunnerService.name);

  constructor(
    private readonly memory: DebateMemoryService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly agentService: AgentService,
    private readonly thesisImprover: ThesisImproverService,
    private readonly verificationService: VerificationService,
  ) {}

  /**
   * Run all 5 consilium phases for a debate.
   * Returns the result of the final phase.
   */
  async runConsilium(debateId: string): Promise<RoundRunnerResult> {
    let lastResult: RoundRunnerResult | null = null;

    for (const phase of CONSILIUM_PHASES) {
      const debate = await this.memory.getDebateOrThrow(debateId);
      if (debate.status !== DebateStatus.RUNNING) {
        throw new Error(`Debate ${debateId} is not running`);
      }

      lastResult = await this.runPhase(debateId, phase);

      // After phases 1-4, if the thesis didn't change or there's nothing to work with, continue anyway
      // Only after phase 5 do we evaluate stop conditions
    }

    if (!lastResult) {
      throw new Error('Consilium produced no results');
    }

    return lastResult;
  }

  private async runPhase(
    debateId: string,
    phase: ConsiliumPhase,
  ): Promise<RoundRunnerResult> {
    const debate = await this.memory.getDebateOrThrow(debateId);
    const roundNumber = debate.roundCount + 1;
    const round = await this.memory.startRound(
      debateId,
      roundNumber,
      debate.currentThesis,
    );

    // Emit phase-start event
    await this.memory.createEvent(debateId, {
      type: DebateEventType.SYSTEM,
      agent: AiAgentName.SYSTEM,
      content: `Consilium phase: ${phase}`,
      roundId: round.id,
      metadata: {
        action: 'CONSILIUM_PHASE_STARTED',
        phase,
        roundNumber,
      },
    });

    try {
      const events = await this.memory.getEvents(debateId);
      let attacks: DebateAttack[];

      switch (phase) {
        case 'INDEPENDENT':
          attacks = await this.runIndependentPhase(debate, events, roundNumber);
          break;
        case 'CROSS_CRITIQUE':
          attacks = await this.runCrossCritiquePhase(debate, events, roundNumber);
          break;
        case 'SYNTHESIS':
          attacks = await this.runSynthesisPhase(debate, events, roundNumber);
          break;
        case 'DEVILS_ADVOCATE':
          attacks = await this.runDevilsAdvocatePhase(debate, events, roundNumber);
          break;
        case 'DECISION':
          attacks = await this.runDecisionPhase(debate, events, roundNumber);
          break;
      }

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

      // For consilium, we force continue through all 5 phases
      // The stop condition is only evaluated by the engine after all 5 phases
      return {
        roundId: round.id,
        roundNumber,
        attacks,
        improvement,
        verifications,
        stopCondition: {
          shouldStop: phase === 'DECISION',
          reason: phase === 'DECISION' ? 'CONSILIUM_COMPLETE' : 'CONTINUE',
        },
      };
    } catch (error) {
      await this.memory.markRoundFailed(debateId, round.id, error);
      throw error;
    }
  }

  /**
   * Phase 1 — Independent positions.
   * Each model gives its position WITHOUT seeing others' opinions.
   * Eliminates groupthink.
   */
  private async runIndependentPhase(
    debate: any,
    events: any[],
    roundNumber: number,
  ): Promise<DebateAttack[]> {
    const prompt = (role: AiAgentRole) => [
      'ФАЗА 1 — НЕЗАВИСИМАЯ ПОЗИЦИЯ',
      '',
      `ТЕЗИС: ${debate.currentThesis}`,
      '',
      `ТВОЯ РОЛЬ: ${role}`,
      '',
      'ЗАДАЧА:',
      'Дай свою независимую позицию по этому тезису.',
      'Ты НЕ знаешь что думают другие модели.',
      'Найди одну конкретную слабость или проблему.',
      'Будь конкретным. Не философствуй.',
    ].join('\n');

    const responses = await this.agentService.runAgents(
      debate.models,
      (agent) => prompt(agent.role),
      debate.userId,
    );

    return responses.map((r) => ({
      id: randomUUID(),
      roundNumber,
      provider: r.provider,
      role: r.role,
      model: r.model,
      content: r.content,
    }));
  }

  /**
   * Phase 2 — Cross-critique.
   * Each model attacks the positions of the other three.
   */
  private async runCrossCritiquePhase(
    debate: any,
    events: any[],
    roundNumber: number,
  ): Promise<DebateAttack[]> {
    // Get the attacks from Phase 1 (previous round)
    const previousAttacks = events
      .filter((e: any) => e.type === 'ATTACK')
      .slice(-4) // last 4 attacks = Phase 1 results
      .map((e: any) => `[${e.role ?? 'UNKNOWN'}]: ${e.content}`)
      .join('\n\n');

    const prompt = (role: AiAgentRole) => [
      'ФАЗА 2 — ПЕРЕКРЁСТНАЯ КРИТИКА',
      '',
      `ТЕЗИС: ${debate.currentThesis}`,
      '',
      'ПОЗИЦИИ ДРУГИХ МОДЕЛЕЙ:',
      previousAttacks,
      '',
      `ТВОЯ РОЛЬ: ${role}`,
      '',
      'ЗАДАЧА:',
      'Атакуй позиции ДРУГИХ моделей (не свою).',
      'Найди слабость в их аргументах.',
      'Укажи конкретно чью позицию атакуешь и почему она неверна.',
    ].join('\n');

    const responses = await this.agentService.runAgents(
      debate.models,
      (agent) => prompt(agent.role),
      debate.userId,
    );

    return responses.map((r) => ({
      id: randomUUID(),
      roundNumber,
      provider: r.provider,
      role: r.role,
      model: r.model,
      content: r.content,
    }));
  }

  /**
   * Phase 3 — Synthesis.
   * Claude collects what survived, forms a unified position.
   */
  private async runSynthesisPhase(
    debate: any,
    events: any[],
    roundNumber: number,
  ): Promise<DebateAttack[]> {
    const allRecentAttacks = events
      .filter((e: any) => e.type === 'ATTACK')
      .slice(-8) // Phases 1 + 2
      .map((e: any) => `[${e.role ?? 'UNKNOWN'}/${e.agent ?? ''}]: ${e.content}`)
      .join('\n\n');

    const prompt = [
      'ФАЗА 3 — СИНТЕЗ',
      '',
      `ИСХОДНЫЙ ТЕЗИС: ${debate.originalThesis}`,
      `ТЕКУЩИЙ ТЕЗИС: ${debate.currentThesis}`,
      '',
      'ВСЕ ПОЗИЦИИ И КРИТИКА (фазы 1-2):',
      allRecentAttacks,
      '',
      'ЗАДАЧА:',
      'Собери что выжило из всех позиций.',
      'Сформируй единую объединённую позицию.',
      'Укажи что было закрыто перекрёстной критикой.',
      'Укажи что осталось спорным.',
      'Результат — один чёткий синтезированный тезис.',
    ].join('\n');

    // Only Claude does the synthesis
    const response = await this.agentService.callProvider(
      'anthropic',
      prompt,
      debate.userId,
    );

    return [{
      id: randomUUID(),
      roundNumber,
      provider: 'anthropic' as const,
      role: 'SYSTEMS_THINKER' as AiAgentRole,
      model: 'CLAUDE' as any,
      content: response,
    }];
  }

  /**
   * Phase 4 — Devil's advocate.
   * Grok attacks the synthesis — the final stress test.
   */
  private async runDevilsAdvocatePhase(
    debate: any,
    events: any[],
    roundNumber: number,
  ): Promise<DebateAttack[]> {
    // Get the synthesis from Phase 3 (last attack)
    const synthesisEvent = events
      .filter((e: any) => e.type === 'ATTACK')
      .slice(-1)[0];

    const synthesis = synthesisEvent?.content ?? debate.currentThesis;

    const prompt = [
      'ФАЗА 4 — АДВОКАТ ДЬЯВОЛА',
      '',
      `ИСХОДНЫЙ ТЕЗИС: ${debate.originalThesis}`,
      '',
      'СИНТЕЗ (результат фаз 1-3):',
      synthesis,
      '',
      'ЗАДАЧА:',
      'Ты — адвокат дьявола. Атакуй синтез максимально жёстко.',
      'Найди то что все остальные пропустили.',
      'Предложи сценарий в котором синтез провалится.',
      'Это последняя проверка перед финальным решением.',
    ].join('\n');

    // Only Grok does the devil's advocacy
    const response = await this.agentService.callProvider(
      'xai',
      prompt,
      debate.userId,
    );

    return [{
      id: randomUUID(),
      roundNumber,
      provider: 'xai' as const,
      role: 'SKEPTIC_INNOVATOR' as AiAgentRole,
      model: 'GROK' as any,
      content: response,
    }];
  }

  /**
   * Phase 5 — Decision and plan.
   * All models contribute to the final decision:
   * what to do, what is needed from humans, success criteria.
   */
  private async runDecisionPhase(
    debate: any,
    events: any[],
    roundNumber: number,
  ): Promise<DebateAttack[]> {
    const recentEvents = events
      .filter((e: any) => e.type === 'ATTACK' || e.type === 'IMPROVEMENT')
      .slice(-12)
      .map((e: any) => `[${e.type}/${e.role ?? 'UNKNOWN'}]: ${e.content}`)
      .join('\n\n');

    const prompt = (role: AiAgentRole) => [
      'ФАЗА 5 — РЕШЕНИЕ И ПЛАН',
      '',
      `ИСХОДНЫЙ ТЕЗИС: ${debate.originalThesis}`,
      `ТЕКУЩИЙ ТЕЗИС: ${debate.currentThesis}`,
      '',
      'ИСТОРИЯ КОНСИЛИУМА (фазы 1-4):',
      recentEvents,
      '',
      `ТВОЯ РОЛЬ: ${role}`,
      '',
      'ЗАДАЧА:',
      'На основе всех фаз консилиума сформулируй:',
      '1. Что конкретно делаем (решение)',
      '2. Что нужно от людей (задачи)',
      '3. Критерии успеха (как измерить)',
      'Будь конкретным и практичным.',
    ].join('\n');

    const responses = await this.agentService.runAgents(
      debate.models,
      (agent) => prompt(agent.role),
      debate.userId,
    );

    return responses.map((r) => ({
      id: randomUUID(),
      roundNumber,
      provider: r.provider,
      role: r.role,
      model: r.model,
      content: r.content,
    }));
  }
}
