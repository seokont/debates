import { Injectable, MessageEvent } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DebateEvent, DebateEventType } from '@prisma/client';
import { Observable } from 'rxjs';

type EventMetadata = Record<string, unknown>;

@Injectable()
export class DebateLiveEventsService {
  private readonly channelPrefix = 'debate.live';

  constructor(private readonly eventEmitter: EventEmitter2) {}

  stream(debateId: string): Observable<MessageEvent> {
    const channel = this.getChannel(debateId);

    return new Observable<MessageEvent>((subscriber) => {
      const handler = (message: MessageEvent) => subscriber.next(message);

      this.eventEmitter.on(channel, handler);

      return () => {
        this.eventEmitter.off(channel, handler);
      };
    });
  }

  emit(event: DebateEvent): void {
    const message = this.toMessage(event);

    if (!message) {
      return;
    }

    this.eventEmitter.emit(this.getChannel(event.debateId), message);
  }

  emitMany(events: DebateEvent[]): void {
    events.forEach((event) => this.emit(event));
  }

  toMessage(event: DebateEvent): MessageEvent | null {
    const type = this.toSseEventName(event);

    if (!type) {
      return null;
    }

    return {
      type,
      data: this.toSseData(event),
    };
  }

  private toSseEventName(event: DebateEvent): string | null {
    switch (event.type) {
      case DebateEventType.ATTACK:
        return 'agent.attack.created';
      case DebateEventType.IMPROVEMENT:
        return 'thesis.improved';
      case DebateEventType.VERIFICATION:
        return 'attack.verified';
      case DebateEventType.FINAL:
        return 'debate.completed';
      case DebateEventType.SYSTEM:
        return this.toSystemSseEventName(event);
      default:
        return null;
    }
  }

  private toSystemSseEventName(event: DebateEvent): string | null {
    const action = this.getMetadataString(event.metadata, 'action');

    switch (action) {
      case 'STARTED':
        return 'debate.started';
      case 'ROUND_STARTED':
        return 'round.started';
      case 'ROUND_COMPLETED':
        return 'round.completed';
      case 'FAILED':
        return 'debate.failed';
      default:
        return null;
    }
  }

  private toSseData(event: DebateEvent) {
    const metadata = this.toMetadata(event.metadata);

    return {
      debateId: event.debateId,
      eventId: event.id,
      roundId: event.roundId,
      roundNumber: metadata ? this.getNumber(metadata, 'roundNumber') : null,
      agent: event.agent,
      role: event.role,
      content: event.content,
      metadata: event.metadata,
      createdAt: event.createdAt.toISOString(),
    };
  }

  private getChannel(debateId: string): string {
    return `${this.channelPrefix}.${debateId}`;
  }

  private getMetadataString(metadata: unknown, key: string): string {
    const parsed = this.toMetadata(metadata);
    const value = parsed?.[key];

    return typeof value === 'string' ? value : '';
  }

  private getNumber(metadata: EventMetadata, key: string): number | null {
    const value = metadata[key];

    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private toMetadata(metadata: unknown): EventMetadata | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return null;
    }

    return metadata as EventMetadata;
  }
}
