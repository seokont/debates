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
          'Ищи неустранимое противоречие в тезисе.',
          'Не пытайся его закрыть — строй карту расхождений.',
          'Покажи где позиции непримиримы.',
          'Будь конкретным.',
        ];
      case DebateMode.GEOPOLITICAL:
        return [
          'Говори от лица своего геополитического блока.',
          'Назови конкретные потери и выгоды своей стороны при реализации тезиса.',
          'Покажи где интересы блоков неизбежно столкнутся.',
          'Без абстракций — только конкретные рычаги, ресурсы, угрозы.',
        ];
      case DebateMode.CONVERGENT:
      default:
        return [
          'Найди одну новую конкретную дыру.',
          'Не повторяй закрытые атаки.',
          'Не делай общую философию.',
          'Ответ должен быть конкретным.',
        ];
    }
  }

  private formatContinuationTask(mode: DebateMode): string[] {
    if (mode === DebateMode.DIVERGENT) {
      return [
        'Продолжи незакрытую линию критики.',
        'Тезис не устранил это противоречие. Покажи почему оно неустранимо.',
        'Усиль аргумент — добавь конкретный пример или механизм провала.',
      ];
    }
    return [
      'Продолжи незакрытую атаку, указанную выше.',
      'Тезис НЕ ответил на твою критику. Не создавай новую атаку.',
      'Сформулируй точнее: что именно осталось без ответа и почему это критично.',
    ];
  }

  private formatAgentRole(role: AiAgentRole, mode: DebateMode): string {
    if (mode === DebateMode.GEOPOLITICAL) {
      return this.formatGeopoliticalRole(role);
    }

    switch (role) {
      case 'STRATEGIST':
        return 'STRATEGIST — задаёт вопрос «Почему именно сейчас и именно это?» Ищет слабость в стратегическом обосновании и выборе момента.';
      case 'SKEPTIC':
        return 'SKEPTIC — ищет слабую причинную связь или неподтверждённую предпосылку.';
      case 'SYSTEMS_THINKER':
        return 'SYSTEMS_THINKER — ищет отложенные системные риски и обратные связи. Задаёт вопрос «Что мы не видим?»';
      case 'PRACTICIAN':
        return 'PRACTICIAN — проверяет ограничения, стимулы, внедрение и исполнение. Задаёт вопрос «Где доказательства что это работает?»';
      case 'SKEPTIC_INNOVATOR':
        return 'SKEPTIC_INNOVATOR — предлагает альтернативную систему целиком. Задаёт вопрос «А что если всё наоборот?»';
      case 'SKEPTIC':
        return 'SKEPTIC — ищет слабую причинную связь или неподтверждённую предпосылку. Задаёт вопрос «Откуда это следует?»';
      case 'OPPONENT':
        return 'OPPONENT — ищет более сильную альтернативную систему решения той же проблемы. Задаёт вопрос «Есть ли лучший способ?»';
      default:
        return `${role} — критически анализирует тезис.`;
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
