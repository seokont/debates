import { Injectable, Logger } from '@nestjs/common';
import { Debate, DebateEvent, DebateEventType } from '@prisma/client';
import { AgentService } from './agent.service';

export interface DebateFinalization {
  opportunityScore: number;
  childQuestions: string[];
  researchGaps: string[];
  crossDomainHypotheses: string[];
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
      'Дебат завершён. Ты создаёшь структурированную аналитическую справку по итогам.',
      'Стиль — как статья в аналитической энциклопедии: конкретно, с принципами, доказательствами и метриками.',
      '',
      `ИСХОДНЫЙ ТЕЗИС: ${debate.originalThesis}`,
      `ФИНАЛЬНЫЙ ТЕЗИС: ${debate.currentThesis}`,
      `РАУНДОВ: ${debate.roundCount}`,
      `ЗАКРЫТЫХ АТАК: ${closedCount}`,
      `ОТКРЫТЫХ СЛАБОСТЕЙ: ${openCount}`,
      '',
      'Ответь СТРОГО в следующем формате:',
      '',
      'OPPORTUNITY_SCORE: <число от 0 до 100>',
      'CHILD_QUESTION_1: <вопрос — начинается с конкретного принципа или механизма из дебата>',
      'CHILD_QUESTION_2: <вопрос — касается незакрытой слабости или нерешённого фальсификатора>',
      'CHILD_QUESTION_3: <вопрос — про практическое внедрение или измеримый результат>',
      'RESEARCH_GAP_1: <пробел — конкретная эмпирическая или теоретическая лакуна с обоснованием>',
      'RESEARCH_GAP_2: <пробел — что нельзя проверить с текущими данными и почему это важно>',
      'CROSS_DOMAIN_1: <гипотеза — как принцип тезиса работает в другой области с конкретным аналогом>',
      'CROSS_DOMAIN_2: <гипотеза — обратный перенос: что другая область может дать этому тезису>',
      '',
      'OPPORTUNITY_SCORE — оцени от 0 до 100: 0 = тезис опровергнут, 50 = спорно, 100 = доказан с метриками.',
      'Каждый пункт — одно развёрнутое предложение с конкретикой, без абстракций.',
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

    return {
      opportunityScore,
      childQuestions,
      researchGaps,
      crossDomainHypotheses,
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
    };
  }
}
