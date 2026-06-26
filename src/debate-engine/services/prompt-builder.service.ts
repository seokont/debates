import { Injectable } from '@nestjs/common';
import { Debate, DebateEvent, DebateEventType, DebateMode, DebateRound } from '@prisma/client';
import { AiAgentRole } from '../types/ai-agent.type';

type EventMetadata = Record<string, unknown>;

type AttackSnapshot = {
  role?: string;
  model?: string;
  content?: string;
  roundNumber?: number;
};

export type ActiveInjection = {
  id: string;
  type: string;
  content: string;
};

export type CarryOverAttack = {
  role: string;
  content: string;
};

@Injectable()
export class PromptBuilderService {
  // Short-term: last N rounds kept verbatim
  private readonly verbatimRounds = 2;
  // Max closed attacks shown in long-term section
  private readonly maxClosedAttacks = 14;
  // Max open weaknesses shown
  private readonly maxOpenWeaknesses = 6;
  // Max recent events shown verbatim
  private readonly maxRecentEvents = 10;
  private readonly maxTextLength = 520;

  /**
   * 3-level memory anchor prompt.
   *
   * Long-term  — all closed attacks aggregated from DebateRound snapshots
   * Medium-term — round trajectories for rounds older than last 2 (compressed)
   * Short-term  — last 2 rounds' events verbatim
   */
  buildAnchorPrompt(
    debate: Debate,
    rounds: DebateRound[],
    recentEvents: DebateEvent[],
    agentRole: AiAgentRole,
    activeInjections: ActiveInjection[] = [],
    carryOverAttack: CarryOverAttack | null = null,
  ): string {
    const sortedRounds = [...rounds].sort((a, b) => a.roundNumber - b.roundNumber);

    const allClosedAttacks = this.extractClosedAttacks(sortedRounds);
    const openWeaknesses = this.extractOpenWeaknesses(sortedRounds);
    const roundHistory = this.buildRoundHistory(sortedRounds);

    const parts: string[] = [
      'ИСХОДНЫЙ ТЕЗИС:',
      debate.originalThesis,
      '',
      'ТЕКУЩАЯ ВЕРСИЯ:',
      debate.currentThesis,
      '',
      'ЗАКРЫТЫЕ АТАКИ:',
      allClosedAttacks.length > 0
        ? allClosedAttacks
            .slice(-this.maxClosedAttacks)
            .map((a) => `- ${a.role}: ${this.truncate(a.content ?? '', 280)}`)
            .join('\n')
        : 'Нет.',
      '',
      'ОТКРЫТЫЕ СЛАБОСТИ:',
      openWeaknesses.length > 0
        ? openWeaknesses
            .slice(-this.maxOpenWeaknesses)
            .map((a) => `- ${a.role}: ${this.truncate(a.content ?? '', 280)}`)
            .join('\n')
        : 'Нет.',
      '',
    ];

    if (roundHistory.length > 0) {
      parts.push('ИСТОРИЯ РАУНДОВ (сжато):');
      parts.push(roundHistory.join('\n'));
      parts.push('');
    }

    parts.push(
      'ПОСЛЕДНИЕ РАУНДЫ:',
      this.formatLastEvents(recentEvents),
      '',
    );

    if (activeInjections.length > 0) {
      parts.push('ВМЕШАТЕЛЬСТВА ЧЕЛОВЕКА (обязательно учти в своём ответе):');
      for (const injection of activeInjections) {
        parts.push(`- [${injection.type}]: ${this.truncate(injection.content)}`);
      }
      parts.push('');
    }

    if (carryOverAttack) {
      parts.push(
        'НЕЗАКРЫТАЯ АТАКА — ПРОДОЛЖИ ЭТУ ЛИНИЮ КРИТИКИ:',
        `${carryOverAttack.role}: ${this.truncate(carryOverAttack.content)}`,
        'Тезис не ответил на эту атаку. Усиль и уточни аргумент.',
        '',
      );
    }

    parts.push(
      'ТВОЯ РОЛЬ:',
      this.formatAgentRole(agentRole, debate.mode),
      '',
      'ЗАДАЧА:',
      ...(carryOverAttack
        ? this.formatContinuationTask(debate.mode)
        : this.formatTask(debate.mode)),
    );

    return parts.join('\n');
  }

  // ── Long-term: aggregate all closed attacks from all round snapshots ──────

  private extractClosedAttacks(rounds: DebateRound[]): AttackSnapshot[] {
    const items: AttackSnapshot[] = [];
    for (const round of rounds) {
      items.push(...this.parseAttackSnapshot(round.closedAttacks));
    }
    return items;
  }

  private extractOpenWeaknesses(rounds: DebateRound[]): AttackSnapshot[] {
    if (rounds.length === 0) return [];
    const lastRound = rounds[rounds.length - 1];
    return this.parseAttackSnapshot(lastRound.openWeaknesses);
  }

  // ── Medium-term: compressed round trajectory for rounds older than last 2 ─

  private buildRoundHistory(rounds: DebateRound[]): string[] {
    const olderRounds = rounds.slice(0, Math.max(0, rounds.length - this.verbatimRounds));
    return olderRounds
      .filter((r) => r.inputThesis && r.outputThesis)
      .map((r) => {
        const score =
          r.improvementScore !== null
            ? ` (оценка: ${Math.round((r.improvementScore ?? 0) * 100)}%)`
            : '';
        return `- Раунд ${r.roundNumber}: "${this.truncate(r.inputThesis ?? '', 100)}" → "${this.truncate(r.outputThesis ?? '', 100)}"${score}`;
      });
  }

  // ── Short-term: last 2 rounds verbatim ────────────────────────────────────

  private formatLastEvents(events: DebateEvent[]): string {
    const recentEvents = events
      .filter((event) =>
        (
          [
            DebateEventType.ATTACK,
            DebateEventType.IMPROVEMENT,
            DebateEventType.VERIFICATION,
            DebateEventType.HUMAN,
          ] as DebateEventType[]
        ).includes(event.type),
      )
      .slice(-this.maxRecentEvents);

    if (recentEvents.length === 0) {
      return 'Пока нет.';
    }

    return recentEvents
      .map((event) => this.formatEvent(event))
      .filter(Boolean)
      .join('\n');
  }

  private formatEvent(event: DebateEvent): string {
    const metadata = this.toMetadata(event.metadata);
    const roundNumber = metadata
      ? this.getNumber(metadata, 'roundNumber') ?? '?'
      : '?';

    switch (event.type) {
      case DebateEventType.ATTACK:
        return [
          `- Раунд ${roundNumber}: атака`,
          `${event.role ?? 'UNKNOWN'}:`,
          this.truncate(event.content),
        ].join(' ');
      case DebateEventType.IMPROVEMENT:
        return [
          `- Раунд ${roundNumber}: улучшение:`,
          this.truncate(
            (metadata ? this.getString(metadata, 'summary') : undefined) ??
              event.content,
          ),
        ].join(' ');
      case DebateEventType.VERIFICATION: {
        const closed = metadata
          ? this.getBoolean(metadata, 'closed')
            ? 'закрыта'
            : 'открыта'
          : 'без статуса';
        const targetRole = metadata
          ? this.getString(metadata, 'targetRole') ?? event.role ?? 'UNKNOWN'
          : event.role ?? 'UNKNOWN';

        return [
          `- Раунд ${roundNumber}: проверка`,
          `${targetRole} ${closed}:`,
          this.truncate(event.content),
        ].join(' ');
      }
      case DebateEventType.HUMAN: {
        const action = metadata ? this.getString(metadata, 'action') : '';

        if (action !== 'HUMAN_INJECTION_ACCEPTED') {
          return `- Человек: ${this.truncate(event.content)}`;
        }

        const injectionType = metadata
          ? this.getString(metadata, 'injectionType') ?? 'UNKNOWN'
          : 'UNKNOWN';

        return [
          `- Вмешательство человека (${injectionType}):`,
          this.truncate(event.content),
        ].join(' ');
      }
      default:
        return `- ${event.type}`;
    }
  }

  // ── Role and task formatting ───────────────────────────────────────────────

  private formatTask(mode: DebateMode): string[] {
    switch (mode) {
      case DebateMode.DIVERGENT:
        return [
          'Ты участник диалога. Твоя задача — не опровергнуть, а раскрыть творческое напряжение.',
          'Это система обсуждения где каждый участник генерирует новые идеи через свою уникальную рамку.',
          'Структурируй вклад строго по формату:',
          '',
          'НАПРЯЖЕНИЕ: [название творческого противоречия в 3–6 словах]',
          'ПОЧЕМУ ЭТО ЦЕННО: [что это напряжение открывает — какая новая возможность или глубина]',
          'НОВАЯ ИДЕЯ: [конкретная идея или концепция которую это напряжение порождает]',
          'АНАЛОГ: [пример из другой области где это напряжение стало источником инновации]',
          'ВОПРОС ДЛЯ ИССЛЕДОВАНИЯ: [что нужно изучить чтобы использовать это напряжение продуктивно]',
        ];
      case DebateMode.GEOPOLITICAL:
        return [
          'Ты участник многосторонних переговоров. Твоя задача — внести вклад от лица своего блока.',
          'Это система диалога где разные интересы ищут точки пересечения и новые совместные возможности.',
          'Структурируй вклад строго по формату:',
          '',
          'ПОЗИЦИЯ БЛОКА: [что конкретно видит и хочет твой блок]',
          'УНИКАЛЬНЫЙ РЕСУРС: [что твой блок может предложить или внести в реализацию тезиса]',
          'ТОЧКА ПЕРЕСЕЧЕНИЯ: [где интересы блоков могут совпасть или создать новую ценность]',
          'ПРЕЦЕДЕНТ: [аналогичная ситуация где разные интересы нашли продуктивное решение]',
          'ПРЕДЛОЖЕНИЕ: [конкретное условие или механизм который сделает тезис выгодным для всех сторон]',
        ];
      case DebateMode.CONVERGENT:
      default:
        return [
          'Ты участник диалога, а не дебатов. Твоя задача — не опровергнуть тезис, а обогатить его.',
          'Это система обсуждения где каждый участник генерирует новые идеи через свою уникальную рамку.',
          'Структурируй вклад строго по формату:',
          '',
          'ВКЛАД: [название твоей новой идеи или перспективы в 3–6 словах]',
          'УНИКАЛЬНЫЙ УГОЛ: [что именно твоя роль видит что другие участники пропускают]',
          'НОВАЯ ИДЕЯ: [конкретное расширение, углубление или развитие тезиса]',
          'АНАЛОГ ИЛИ ДОКАЗАТЕЛЬСТВО: [реальный пример, исследование или прецедент который поддерживает идею]',
          'ВОПРОС ДЛЯ СИНТЕЗА: [что нужно решить чтобы интегрировать эту идею в тезис]',
          '',
          'Не повторяй идеи уже интегрированные в тезис. Один вклад — одна конкретная новая мысль.',
        ];
    }
  }

  private formatContinuationTask(mode: DebateMode): string[] {
    if (mode === DebateMode.DIVERGENT) {
      return [
        'Твоя идея ещё не была интегрирована в синтез. Углуби и развей её:',
        '',
        'НАПРЯЖЕНИЕ: [уточни или переформулируй точнее]',
        'ПОЧЕМУ ЭТО ЦЕННО: [усиль — покажи какую конкретную возможность открывает это напряжение]',
        'НОВАЯ ИДЕЯ: [конкретизируй идею — добавь механизм реализации]',
        'АНАЛОГ: [добавь или уточни пример]',
        'ВОПРОС ДЛЯ ИССЛЕДОВАНИЯ: [уточни что именно нужно изучить]',
      ];
    }
    return [
      'Твоя идея ещё не была интегрирована в синтез. Углуби и развей её:',
      '',
      'ВКЛАД: [уточни формулировку идеи]',
      'УНИКАЛЬНЫЙ УГОЛ: [усиль — объясни глубже что именно упускается без этой перспективы]',
      'НОВАЯ ИДЕЯ: [конкретизируй — добавь шаги реализации или измеримый результат]',
      'АНАЛОГ ИЛИ ДОКАЗАТЕЛЬСТВО: [добавь новый пример или метрику которая подтверждает ценность идеи]',
      'ВОПРОС ДЛЯ СИНТЕЗА: [уточни что нужно решить для интеграции]',
    ];
  }

  private formatAgentRole(role: AiAgentRole, mode: DebateMode): string {
    if (mode === DebateMode.GEOPOLITICAL) {
      return this.formatGeopoliticalRole(role);
    }

    switch (role) {
      case 'STRATEGIST':
        return 'STRATEGIST [Timing & Opportunity] — Твоя рамка: «Когда и при каких условиях эта идея расцветёт?» Ты видишь рыночные окна, исторические прецеденты и стратегические моменты которые другие участники пропускают. Твой вклад — показать конкретный путь от тезиса к реальному влиянию.';
      case 'SKEPTIC':
        return 'SKEPTIC [Assumption Explorer] — Твоя рамка: «Какие неочевидные допущения скрыты в тезисе?» Ты раскрываешь скрытые предпосылки которые если сделать явными — открывают новые возможности или пути развития. Твой вклад — превратить скрытое допущение в явный инсайт.';
      case 'SYSTEMS_THINKER':
        return 'SYSTEMS_THINKER [Emergence & Feedback] — Твоя рамка: «Что возникает когда эта идея взаимодействует с системой?» Ты видишь второй и третий порядок эффектов, неожиданные синергии и петли обратной связи. Твой вклад — показать как тезис создаёт новые возможности через системные эффекты.';
      case 'PRACTICIAN':
        return 'PRACTICIAN [Real-World Design] — Твоя рамка: «Как именно это работает на практике?» Ты превращаешь абстрактные идеи в конкретные механизмы, пилоты и измеримые шаги. Твой вклад — предложить минимальный работающий вариант и критерии успеха.';
      case 'SKEPTIC_INNOVATOR':
        return 'SKEPTIC_INNOVATOR [Alternative Futures] — Твоя рамка: «А что если посмотреть на это совершенно иначе?» Ты строишь альтернативные сценарии и инвертированные системы которые открывают неожиданные углы. Твой вклад — предложить радикально другую интерпретацию которая обогащает общее понимание.';
      default:
        return `${role} — участник диалога, вносящий уникальный вклад через свою рамку восприятия.`;
    }
  }

  private formatGeopoliticalRole(role: AiAgentRole): string {
    switch (role) {
      case 'STRATEGIST':
        return 'США / Западный блок — ты отстаиваешь интересы американо-европейского альянса: верховенство права, технологическое лидерство, долларовая система. Покажи что теряет Запад и какие рычаги давления использует.';
      case 'SYSTEMS_THINKER':
        return 'Европейский союз — ты говоришь от лица Брюсселя: регуляторный суверенитет, стратегическая автономия, цифровой единый рынок. Покажи где тезис входит в противоречие с европейскими интересами и нормами.';
      case 'PRACTICIAN':
        return 'Китай / БРИКС — ты представляешь позицию Пекина и незападного блока: мультиполярность, технологическая независимость, альтернативные расчётные системы. Покажи как тезис меняет баланс сил и где Китай выигрывает или проигрывает.';
      case 'SKEPTIC_INNOVATOR':
        return 'Незападный мир / Глобальный Юг — ты говоришь от лица стран вне блокового противостояния: Индия, Африка, Юго-Восточная Азия, Латинская Америка. Покажи кто остаётся в стороне от выгод, кто несёт скрытые издержки.';
      default:
        return `${role} — аналитик геополитических интересов.`;
    }
  }

  // ── JSON snapshot parsing ─────────────────────────────────────────────────

  private parseAttackSnapshot(json: unknown): AttackSnapshot[] {
    if (!Array.isArray(json)) return [];
    return (json as unknown[])
      .filter(
        (item): item is AttackSnapshot =>
          typeof item === 'object' &&
          item !== null &&
          !Array.isArray(item) &&
          typeof (item as AttackSnapshot).content === 'string',
      )
      .map((item) => ({
        role: typeof item.role === 'string' ? item.role : 'UNKNOWN',
        model: typeof item.model === 'string' ? item.model : 'UNKNOWN',
        content: item.content,
        roundNumber:
          typeof item.roundNumber === 'number' ? item.roundNumber : undefined,
      }));
  }

  // ── Metadata helpers ──────────────────────────────────────────────────────

  private toMetadata(metadata: unknown): EventMetadata | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return null;
    }
    return metadata as EventMetadata;
  }

  private getString(metadata: EventMetadata, key: string): string | undefined {
    const value = metadata[key];
    return typeof value === 'string' ? value : undefined;
  }

  private getNumber(metadata: EventMetadata, key: string): number | null {
    const value = metadata[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private getBoolean(
    metadata: EventMetadata,
    key: string,
  ): boolean | undefined {
    const value = metadata[key];
    return typeof value === 'boolean' ? value : undefined;
  }

  private truncate(text: string, maxLength = this.maxTextLength): string {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) {
      return normalized;
    }
    return `${normalized.slice(0, maxLength - 3)}...`;
  }
}
