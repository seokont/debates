import { InjectQueue } from '@nestjs/bullmq';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AiAgentName,
  CreditTransactionType,
  DebateEvent,
  DebateEventType,
  DebateStatus,
  InjectionStatus,
  Prisma,
} from '@prisma/client';
import { Job, Queue } from 'bullmq';
import { DebateLiveEventsService } from '../debate-events/debate-live-events.service';
import {
  BILLING_QUEUE,
  DEBATE_QUEUE,
  NOTIFICATION_QUEUE,
  RUN_DEBATE_JOB,
} from '../debates/debates.constants';
import { DebateJobData } from '../debates/types/debate-job-data.type';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { AdminDebatesQueryDto } from './dto/admin-debates-query.dto';

type QueueName = typeof DEBATE_QUEUE | typeof NOTIFICATION_QUEUE | typeof BILLING_QUEUE;

type EventMetadata = Record<string, unknown>;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly liveEvents: DebateLiveEventsService,
    private readonly telegramService: TelegramService,
    @InjectQueue(DEBATE_QUEUE)
    private readonly debateQueue: Queue<DebateJobData>,
    @InjectQueue(NOTIFICATION_QUEUE)
    private readonly notificationQueue: Queue,
    @InjectQueue(BILLING_QUEUE)
    private readonly billingQueue: Queue,
  ) {}

  async listDebates(query: AdminDebatesQueryDto) {
    const debates = await this.prisma.debate.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.userId ? { userId: query.userId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: query.take ?? 50,
      select: {
        id: true,
        title: true,
        slug: true,
        originalThesis: true,
        currentThesis: true,
        mode: true,
        status: true,
        visibility: true,
        tier: true,
        models: true,
        roundCount: true,
        maxRounds: true,
        quietMode: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            role: true,
            balanceCredits: true,
          },
        },
        events: {
          where: {
            OR: [
              { type: DebateEventType.FINAL },
              { type: DebateEventType.SYSTEM },
            ],
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        _count: {
          select: {
            rounds: true,
            events: true,
            injections: true,
            comments: true,
          },
        },
      },
    });

    return debates.map((debate) => ({
      ...debate,
      lastFailure: this.getLastFailure(debate.events),
      estimatedCreditCost: debate.visibility === 'PRIVATE' ? 5 : 1,
    }));
  }

  async getDebate(id: string) {
    const debate = await this.prisma.debate.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            role: true,
            balanceCredits: true,
            createdAt: true,
          },
        },
        rounds: {
          orderBy: [{ roundNumber: 'asc' }, { startedAt: 'asc' }],
        },
        events: {
          orderBy: { createdAt: 'asc' },
          take: 500,
        },
        injections: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                username: true,
                role: true,
              },
            },
          },
        },
        comments: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                username: true,
                role: true,
              },
            },
          },
        },
      },
    });

    if (!debate) {
      throw new NotFoundException('Debate not found');
    }

    const billing = await this.getDebateBillingSnapshot(
      debate.userId,
      debate.createdAt,
    );

    return {
      ...debate,
      logs: debate.events,
      lastFailure: this.getLastFailure(debate.events),
      aiUsage: this.getAiUsage(debate.events),
      billing,
    };
  }

  async retryDebate(id: string) {
    const debate = await this.prisma.debate.findUnique({ where: { id } });

    if (!debate) {
      throw new NotFoundException('Debate not found');
    }

    if (debate.status !== DebateStatus.FAILED) {
      throw new ConflictException('Only failed debates can be retried');
    }

    const { updated, event } = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.debate.update({
        where: { id },
        data: {
          status: DebateStatus.PENDING,
          completedAt: null,
        },
      });
      const event = await tx.debateEvent.create({
        data: {
          debateId: id,
          type: DebateEventType.SYSTEM,
          agent: AiAgentName.SYSTEM,
          content: 'Admin retry queued',
          metadata: {
            action: 'ADMIN_RETRY_QUEUED',
            previousStatus: debate.status,
          },
        },
      });

      return { updated, event };
    });

    this.liveEvents.emit(event);

    const job = await this.debateQueue.add(
      RUN_DEBATE_JOB,
      {
        debateId: updated.id,
        userId: updated.userId,
        restart: true,
      },
      {
        jobId: `${RUN_DEBATE_JOB}:admin-retry:${updated.id}:${Date.now()}`,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );

    return {
      debateId: updated.id,
      status: updated.status,
      jobId: job.id,
    };
  }

  async acceptInjection(id: string) {
    const existing = await this.prisma.humanInjection.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Injection not found');
    }

    if (
      existing.status === InjectionStatus.ACCEPTED ||
      existing.status === InjectionStatus.USED_IN_ROUND
    ) {
      return existing;
    }

    if (existing.status === InjectionStatus.REJECTED) {
      throw new ConflictException('Rejected injection cannot be accepted');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const injection = await tx.humanInjection.update({
        where: { id },
        data: {
          status: InjectionStatus.ACCEPTED,
          acceptedAt: new Date(),
        },
      });
      const event = await tx.debateEvent.create({
        data: {
          debateId: injection.debateId,
          type: DebateEventType.HUMAN,
          content: injection.content,
          metadata: {
            action: 'HUMAN_INJECTION_ACCEPTED',
            injectionId: injection.id,
            injectionType: injection.type,
            status: injection.status,
            userId: injection.userId,
            acceptedBy: 'ADMIN',
          },
        },
      });

      return { injection, event };
    });

    this.liveEvents.emit(result.event);
    await this.telegramService.notifyHumanInjectionAccepted(result.injection.id);

    return result.injection;
  }

  async rejectInjection(id: string) {
    const existing = await this.prisma.humanInjection.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Injection not found');
    }

    if (existing.status === InjectionStatus.REJECTED) {
      return existing;
    }

    if (
      existing.status === InjectionStatus.ACCEPTED ||
      existing.status === InjectionStatus.USED_IN_ROUND
    ) {
      throw new ConflictException('Accepted injection cannot be rejected');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const injection = await tx.humanInjection.update({
        where: { id },
        data: {
          status: InjectionStatus.REJECTED,
        },
      });
      const event = await tx.debateEvent.create({
        data: {
          debateId: injection.debateId,
          type: DebateEventType.SYSTEM,
          agent: AiAgentName.SYSTEM,
          content: 'Human injection rejected',
          metadata: {
            action: 'HUMAN_INJECTION_REJECTED',
            injectionId: injection.id,
            injectionType: injection.type,
            userId: injection.userId,
            rejectedBy: 'ADMIN',
          },
        },
      });

      return { injection, event };
    });

    this.liveEvents.emit(result.event);

    return result.injection;
  }

  async getJobs() {
    const queues = [
      { name: DEBATE_QUEUE, queue: this.debateQueue },
      { name: NOTIFICATION_QUEUE, queue: this.notificationQueue },
      { name: BILLING_QUEUE, queue: this.billingQueue },
    ] satisfies Array<{ name: QueueName; queue: Queue }>;

    const snapshots = await Promise.all(
      queues.map(async ({ name, queue }) => ({
        name,
        counts: await queue.getJobCounts(
          'waiting',
          'active',
          'delayed',
          'completed',
          'failed',
          'paused',
        ),
        recent: await this.getRecentJobs(queue),
      })),
    );

    return { queues: snapshots };
  }

  private async getRecentJobs(queue: Queue) {
    const jobs = await queue.getJobs(
      ['failed', 'active', 'waiting', 'delayed', 'completed'],
      0,
      20,
      false,
    );

    return Promise.all(jobs.map((job) => this.toJobSnapshot(job)));
  }

  private async toJobSnapshot(job: Job) {
    return {
      id: job.id,
      name: job.name,
      state: await job.getState(),
      data: job.data,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp ? new Date(job.timestamp).toISOString() : null,
      processedOn: job.processedOn
        ? new Date(job.processedOn).toISOString()
        : null,
      finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
      failedReason: job.failedReason,
      stacktrace: job.stacktrace,
    };
  }

  private async getDebateBillingSnapshot(userId: string, createdAt: Date) {
    const transactions = await this.prisma.creditTransaction.findMany({
      where: {
        userId,
        createdAt: { gte: createdAt },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    const debits = transactions
      .filter((transaction) => transaction.type === CreditTransactionType.DEBIT)
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const credits = transactions
      .filter((transaction) => transaction.type === CreditTransactionType.CREDIT)
      .reduce((sum, transaction) => sum + transaction.amount, 0);

    return {
      note: 'Credit transactions are user-scoped in MVP, not linked to debateId.',
      debits,
      credits,
      netCredits: credits - debits,
      transactions,
    };
  }

  private getAiUsage(events: DebateEvent[]) {
    const aiEvents = events.filter((event) => event.type === DebateEventType.ATTACK);
    const byProvider = new Map<string, { count: number; models: Set<string> }>();

    for (const event of aiEvents) {
      const metadata = this.toMetadata(event.metadata);
      const provider = this.getString(metadata, 'provider') ?? 'unknown';
      const model = this.getString(metadata, 'model') ?? event.agent ?? 'unknown';
      const current = byProvider.get(provider) ?? {
        count: 0,
        models: new Set<string>(),
      };

      current.count += 1;
      current.models.add(model);
      byProvider.set(provider, current);
    }

    return {
      trackedCosts: false,
      note: 'Token usage and provider spend are not persisted yet; pg/model-cost tracking can be added later.',
      providerCallCount: aiEvents.length,
      byProvider: [...byProvider.entries()].map(([provider, value]) => ({
        provider,
        count: value.count,
        models: [...value.models],
      })),
    };
  }

  private getLastFailure(events: DebateEvent[]) {
    const failure = [...events]
      .reverse()
      .find((event) => this.getMetadataAction(event.metadata) === 'FAILED');

    if (!failure) {
      return null;
    }

    const metadata = this.toMetadata(failure.metadata);

    return {
      eventId: failure.id,
      reason:
        this.getString(metadata, 'reason') ||
        this.getString(metadata, 'detail') ||
        failure.content,
      createdAt: failure.createdAt,
    };
  }

  private getMetadataAction(metadata: Prisma.JsonValue): string {
    return this.getString(this.toMetadata(metadata), 'action') ?? '';
  }

  private toMetadata(metadata: Prisma.JsonValue): EventMetadata | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return null;
    }

    return metadata as EventMetadata;
  }

  private getString(metadata: EventMetadata | null, key: string): string | null {
    const value = metadata?.[key];

    return typeof value === 'string' ? value : null;
  }
}
