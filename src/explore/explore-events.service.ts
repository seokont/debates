import { Injectable, MessageEvent } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Observable } from 'rxjs';

export type ExploreEvent = {
  type: string;
  sessionId: string;
  data: Record<string, unknown>;
};

@Injectable()
export class ExploreEventsService {
  private readonly channelPrefix = 'explore.live';

  constructor(private readonly eventEmitter: EventEmitter2) {}

  stream(sessionId: string): Observable<MessageEvent> {
    const channel = `${this.channelPrefix}.${sessionId}`;

    return new Observable<MessageEvent>((subscriber) => {
      const handler = (event: ExploreEvent) => {
        subscriber.next({
          type: event.type,
          data: JSON.stringify(event.data),
        } satisfies MessageEvent);
      };

      this.eventEmitter.on(channel, handler);
      return () => this.eventEmitter.off(channel, handler);
    });
  }

  emit(event: ExploreEvent): void {
    this.eventEmitter.emit(`${this.channelPrefix}.${event.sessionId}`, event);
  }
}
