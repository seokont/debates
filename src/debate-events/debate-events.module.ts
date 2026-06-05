import { Module } from '@nestjs/common';
import { DebateLiveEventsService } from './debate-live-events.service';

@Module({
  providers: [DebateLiveEventsService],
  exports: [DebateLiveEventsService],
})
export class DebateEventsModule {}
