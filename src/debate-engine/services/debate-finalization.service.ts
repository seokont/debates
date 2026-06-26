import { Injectable, Logger } from '@nestjs/common';
import { Debate, DebateEvent, DebateEventType } from '@prisma/client';
import { AgentService } from './agent.service';

export interface DebateFinalization {
  opportunityScore: number;
  childQuestions: string[];
  researchGaps: string[];
  crossDomainHypotheses: string[];
  profitPatterns: string[];
  fundingBranches: string[];
}

@Injectable()
export class DebateFinalizationService {
  private readonly logger = new Logger(DebateFinalizationService.name);

  constructor(private readonly agentService: AgentService) {}

  async generate(
    debate: Debate,
    events: DebateEvent[],
    userId?: string,
  ): Promise<DebateFinalization> {
    try {
      return await this.generateWithAi(debate, events, userId);
    } catch (error) {
      this.logger.warn(
        `AI finalization failed, using defaults: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return this.defaultFinalization();
    }
  }

  private async generateWithAi(
    debate: Debate,
    events: DebateEvent[],
    userId?: string,
  ): Promise<DebateFinalization> {
    const attackCount = events.filter(
      (e) => e.type === DebateEventType.ATTACK,
    ).length;
    const closedCount = this.countClosedAttacks(events);
    const openCount = attackCount - closedCount;

    const prompt = [
      'Дебат завершён. Проанализируй результат и сгенерируй итоговые данные.',
      '',
      `ИСХОДНЫЙ ТЕЗИС: ${debate.originalThesis}`,
      `ФИНАЛЬНЫЙ ТЕЗИС: ${debate.currentThesis}`,
      `РАУНДОВ: ${debate.roundCount}`,
      `ЗАКРЫТЫХ АТАК: ${closedCount}`,
      `ОТКРЫТЫХ СЛАБОСТЕЙ: ${openCount}`,
      '',
      'Ответь СТРОГО в следующем формате (без дополнительного текста):',
      '',
      'OPPORTUNITY_SCORE: <число от 0 до 100>',
      'CHILD_QUESTION_1: <вопрос вытекающий из финального тезиса>',
      'CHILD_QUESTION_2: <вопрос вытекающий из финального тезиса>',
      'CHILD_QUESTION_3: <вопрос вытекающий из финального тезиса>',
      'RESEARCH_GAP_1: <что не исследовано и блокирует проверку тезиса>',
      'RESEARCH_GAP_2: <что не исследовано и блокирует проверку тезиса>',
      'CROSS_DOMAIN_1: <как тезис применим в другой области>',
      'CROSS_DOMAIN_2: <как тезис применим в другой области>',
      'PROFIT_PATTERN_1: <название паттерна>: <как тезис реализует этот паттерн>',
      'PROFIT_PATTERN_2: <название паттерна>: <как тезис реализует этот паттерн>',
      'PROFIT_PATTERN_3: <название паттерна>: <как тезис реализует этот паттерн>',
      'FUNDING_BRANCH_1: <предложение ветки для финансирования — что строить и почему это перспективно>',
      'FUNDING_BRANCH_2: <предложение ветки для финансирования — смежная идея которая выросла из дебата>',
      '',
      'OPPORTUNITY_SCORE: 0 = тезис слаб, 50 = спорно, 100 = доказан и перспективен.',
      'PROFIT_PATTERN — выбирай из: Picks & Shovels, Toll Road, Data Flywheel, Democratization,',
      '  Compress Time, Aggregator, Behavior Unlock, Bundling/Unbundling.',
      '  Указывай только те паттерны которые реально применимы к тезису.',
      'FUNDING_BRANCH — конкретное направление для инвестиции или запуска продукта.',
    ].join('\n');

    const raw = await this.agentService.callProvider('anthropic', prompt, userId);
    return this.parseFinalizationResponse(raw);
  }

  private parseFinalizationResponse(raw: string): DebateFinalization {
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);

    const extract = (prefix: string): string | undefined => {
      const line = lines.find((l) =>
        l.toUpperCase().startsWith(prefix.toUpperCase()),
      );
      return line?.replace(new RegExp(`^${prefix}:\\s*`, 'i'), '').trim();
    };

    const scoreRaw = extract('OPPORTUNITY_SCORE');
    const opportunityScore = scoreRaw
      ? Math.max(0, Math.min(100, parseInt(scoreRaw, 10) || 0))
      : 0;

    const childQuestions = [
      extract('CHILD_QUESTION_1'),
      extract('CHILD_QUESTION_2'),
      extract('CHILD_QUESTION_3'),
    ].filter((q): q is string => Boolean(q));

    const researchGaps = [
      extract('RESEARCH_GAP_1'),
      extract('RESEARCH_GAP_2'),
    ].filter((g): g is string => Boolean(g));

    const crossDomainHypotheses = [
      extract('CROSS_DOMAIN_1'),
      extract('CROSS_DOMAIN_2'),
    ].filter((h): h is string => Boolean(h));

    const profitPatterns = [
      extract('PROFIT_PATTERN_1'),
      extract('PROFIT_PATTERN_2'),
      extract('PROFIT_PATTERN_3'),
    ].filter((p): p is string => Boolean(p));

    const fundingBranches = [
      extract('FUNDING_BRANCH_1'),
      extract('FUNDING_BRANCH_2'),
    ].filter((b): b is string => Boolean(b));

    return {
      opportunityScore,
      childQuestions,
      researchGaps,
      crossDomainHypotheses,
      profitPatterns,
      fundingBranches,
    };
  }

  private countClosedAttacks(events: DebateEvent[]): number {
    return events.filter((e) => {
      if (e.type !== DebateEventType.VERIFICATION) return false;
      const meta = e.metadata as Record<string, unknown> | null;
      return meta?.closed === true;
    }).length;
  }

  private defaultFinalization(): DebateFinalization {
    return {
      opportunityScore: 0,
      childQuestions: [],
      researchGaps: [],
      crossDomainHypotheses: [],
      profitPatterns: [],
      fundingBranches: [],
    };
  }
}
