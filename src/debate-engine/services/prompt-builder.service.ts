import { Injectable } from '@nestjs/common';
import { Debate, DebateEvent, DebateEventType, DebateMode } from '@prisma/client';
import { AiAgentRole } from '../types/ai-agent.type';

type EventMetadata = Record<string, unknown>;

type AttackMemoryItem = {
  attackId: string;
  roundNumber: number | null;
  role: string;
  model: string;
  content: string;
};

type VerificationMemoryItem = {
  attackId: string;
  roundNumber: number | null;
  role: string;
  closed: boolean;
  status: 'closed' | 'partially' | 'open';
  reason: string;
};

export type ActiveInjection = {
  id: string;
  type: string;
  content: string;
};

@Injectable()
export class PromptBuilderService {
  private readonly maxMemoryItems = 12;
  private readonly maxRecentEvents = 10;
  private readonly maxTextLength = 520;

  buildAnchorPrompt(
    debate: Debate,
    events: DebateEvent[],
    agentRole: AiAgentRole,
    activeInjections: ActiveInjection[] = [],
  ): string {
    const attacks = this.getAttackMemory(events);
    const verifications = this.getLatestVerifications(events);
    const closedAttacks = attacks.filter((attack) => {
      const verification = verifications.get(attack.attackId);

      return verification?.closed === true;
    });
    const openWeaknesses = attacks.filter((attack) => {
      const verification = verifications.get(attack.attackId);

      return verification?.closed !== true;
    });

    const parts: string[] = [
      'ИСХОДНЫЙ ТЕЗИС:',
      debate.originalThesis,
      '',
      'ТЕКУЩАЯ ВЕРСИЯ:',
      debate.currentThesis,
      '',
      'ЗАКРЫТЫЕ АТАКИ:',
      this.formatAttacks(closedAttacks, verifications),
      '',
      'ОТКРЫТЫЕ СЛАБОСТИ:',
      this.formatAttacks(openWeaknesses, verifications),
      '',
      'ПОСЛЕДНИЕ РАУНДЫ:',
      this.formatLastEvents(events),
      '',
    ];

    if (activeInjections.length > 0) {
      parts.push('ВМЕШАТЕЛЬСТВА ЧЕЛОВЕКА (обязательно учти в своём ответе):');
      for (const injection of activeInjections) {
        parts.push(`- [${injection.type}]: ${this.truncate(injection.content)}`);
      }
      parts.push('');
    }

    parts.push(
      'ТВОЯ РОЛЬ:',
      this.formatAgentRole(agentRole),
      '',
      'ЗАДАЧА:',
      ...this.formatTask(debate.mode),
    );

    return parts.join('\n');
  }

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
          'Ты представляешь конкретную логику интересов.',
          'Покажи что получает и что теряет твоя сторона при реализации тезиса.',
          'Называй конкретные потери и выгоды. Без абстракций.',
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

  private getAttackMemory(events: DebateEvent[]): AttackMemoryItem[] {
    return events
      .filter((event) => event.type === DebateEventType.ATTACK)
      .map((event) => {
        const metadata = this.toMetadata(event.metadata);

        return {
          attackId: metadata ? this.getString(metadata, 'attackId') ?? '' : '',
          roundNumber: metadata
            ? this.getNumber(metadata, 'roundNumber')
            : null,
          role: event.role ?? 'UNKNOWN',
          model: event.agent ?? 'UNKNOWN',
          content: event.content,
        };
      })
      .filter((attack) => attack.attackId && attack.content);
  }

  private getLatestVerifications(
    events: DebateEvent[],
  ): Map<string, VerificationMemoryItem> {
    const verifications = new Map<string, VerificationMemoryItem>();

    events
      .filter((event) => event.type === DebateEventType.VERIFICATION)
      .forEach((event) => {
        const metadata = this.toMetadata(event.metadata);
        const attackId = metadata
          ? this.getString(metadata, 'attackId')
          : undefined;

        if (!metadata || !attackId) {
          return;
        }

        const status = this.getString(metadata, 'status') as 'closed' | 'partially' | 'open' | undefined;
        const closedFallback = this.getBoolean(metadata, 'closed') ?? false;

        verifications.set(attackId, {
          attackId,
          roundNumber: this.getNumber(metadata, 'roundNumber'),
          role:
            this.getString(metadata, 'targetRole') ?? event.role ?? 'UNKNOWN',
          closed: status ? status === 'closed' : closedFallback,
          status: status ?? (closedFallback ? 'closed' : 'open'),
          reason: event.content,
        });
      });

    return verifications;
  }

  private formatAttacks(
    attacks: AttackMemoryItem[],
    verifications: Map<string, VerificationMemoryItem>,
  ): string {
    if (attacks.length === 0) {
      return 'Нет.';
    }

    return attacks
      .slice(-this.maxMemoryItems)
      .map((attack) => {
        const verification = verifications.get(attack.attackId);
        const round = attack.roundNumber ?? '?';
        const status = verification
          ? verification.status === 'closed'
            ? 'закрыта'
            : verification.status === 'partially'
              ? 'частично закрыта'
              : 'открыта'
          : 'без проверки';
        const reason = verification?.reason
          ? ` Проверка: ${this.truncate(verification.reason, 180)}`
          : '';

        return `- Раунд ${round}; ${attack.role}/${attack.model}; ${status}: ${this.truncate(attack.content)}${reason}`;
      })
      .join('\n');
  }

  private formatLastEvents(events: DebateEvent[]): string {
    const recentEvents = events
      .filter((event) =>
        ([
          DebateEventType.ATTACK,
          DebateEventType.IMPROVEMENT,
          DebateEventType.VERIFICATION,
          DebateEventType.HUMAN,
        ] as DebateEventType[]).includes(event.type),
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

  private formatAgentRole(role: AiAgentRole): string {
    switch (role) {
      case 'STRATEGIST':
        return 'STRATEGIST - задаёт вопрос «Почему именно сейчас и именно это?» Ищет слабость в стратегическом обосновании и выборе момента.';
      case 'SKEPTIC':
        return 'SKEPTIC - ищет слабую причинную связь или неподтвержденную предпосылку.';
      case 'SYSTEMS_THINKER':
        return 'SYSTEMS_THINKER - ищет отложенные системные риски и обратные связи. Задаёт вопрос «Что мы не видим?»';
      case 'PRACTICIAN':
        return 'PRACTICIAN - проверяет ограничения, стимулы, внедрение и исполнение. Задаёт вопрос «Где доказательства что это работает?»';
      case 'SKEPTIC_INNOVATOR':
        return 'SKEPTIC_INNOVATOR - предлагает альтернативную систему целиком. Задаёт вопрос «А что если всё наоборот?»';
      case 'OPPONENT':
        return 'OPPONENT - ищет более сильную альтернативную систему.';
    }
  }

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

  private getBoolean(metadata: EventMetadata, key: string): boolean | undefined {
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
