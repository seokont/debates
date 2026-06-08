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
      'CHILD_QUESTION_1: <вопрос>',
      'CHILD_QUESTION_2: <вопрос>',
      'CHILD_QUESTION_3: <вопрос>',
      'RESEARCH_GAP_1: <пробел в исследованиях>',
      'RESEARCH_GAP_2: <пробел в исследованиях>',
      'CROSS_DOMAIN_1: <кросс-доменная гипотеза>',
      'CROSS_DOMAIN_2: <кросс-доменная гипотеза>',
      '',
      'OPPORTUNITY_SCORE — оцени от 0 до 100 коммерческий и научный потенциал темы.',
      'CHILD_QUESTION — три вопроса которые возникают из финального тезиса.',
      'RESEARCH_GAP — что ещё не исследовано и блокирует проверку тезиса.',
      'CROSS_DOMAIN — как этот тезис может быть применён в другой области.',
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
