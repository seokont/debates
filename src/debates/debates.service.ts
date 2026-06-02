import { InjectQueue } from '@nestjs/bullmq';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  MessageEvent,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  Debate,
  DebateMode,
  DebateStatus,
  Prisma,
  UserRole,
  Visibility,
} from '@prisma/client';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { from, interval, Observable } from 'rxjs';
import { map, mergeMap, startWith, switchMap } from 'rxjs/operators';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { DEBATES_QUEUE, RUN_DEBATE_JOB } from './debates.constants';
import { CreateDebateDto } from './dto/create-debate.dto';
import { DebateJobData } from './types/debate-job-data.type';

@Injectable()
export class DebatesService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(DEBATES_QUEUE)
    private readonly debatesQueue: Queue<DebateJobData>,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateDebateDto) {
    const debate = await this.prisma.$transaction(async (tx) => {
      await this.chargeCredit(tx, user.id);

      const created = await tx.debate.create({
        data: {
          userId: user.id,
          title: this.makeTitle(dto.thesis),
          slug: this.makeSlug(dto.thesis),
          originalThesis: dto.thesis,
          currentThesis: dto.thesis,
          mode: dto.mode ?? DebateMode.CONVERGENT,
          visibility: dto.visibility ?? Visibility.PUBLIC,
          models: dto.models,
          maxRounds: dto.maxRounds ?? 6,
          quietMode: dto.quietMode ?? false,
        },
      });

      await tx.debateEvent.create({
        data: {
          debateId: created.id,
          type: 'CREATED',
          payload: {
            models: dto.models,
            maxRounds: dto.maxRounds ?? 6,
            quietMode: dto.quietMode ?? false,
          },
        },
      });

      return created;
    });

    try {
      await this.enqueueDebate(debate, user.id, false);
    } catch (error) {
      await this.failDebateAndRefund(debate.id, user.id, error);
    }

    return { debateId: debate.id };
  }

  findAll(user?: AuthenticatedUser) {
    return this.prisma.debate.findMany({
      where: this.readableWhere(user),
      orderBy: { createdAt: 'desc' },
      take: 50,
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
        finalThesis: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findOne(id: string, user?: AuthenticatedUser) {
    const debate = await this.prisma.debate.findFirst({
      where: {
        id,
        ...this.readableWhere(user),
      },
      include: {
        rounds: {
          orderBy: [{ roundNumber: 'asc' }, { createdAt: 'asc' }],
        },
        events: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!debate) {
      throw new NotFoundException('Debate not found');
    }

    return debate;
  }

  async findFinal(id: string, user?: AuthenticatedUser) {
    const debate = await this.prisma.debate.findFirst({
      where: {
        id,
        ...this.readableWhere(user),
      },
      select: {
        id: true,
        status: true,
        finalSummary: true,
        finalThesis: true,
        layer1Summary: true,
        layer2Summary: true,
        completedAt: true,
      },
    });

    if (!debate) {
      throw new NotFoundException('Debate not found');
    }

    return debate;
  }

  async restart(id: string, user: AuthenticatedUser) {
    const debate = await this.prisma.debate.findUnique({ where: { id } });
    if (!debate) {
      throw new NotFoundException('Debate not found');
    }

    this.assertCanManage(debate, user);

    if (
      debate.status === DebateStatus.PENDING ||
      debate.status === DebateStatus.RUNNING
    ) {
      throw new ConflictException('Debate is already active');
    }

    const restarted = await this.prisma.$transaction(async (tx) => {
      await this.chargeCredit(tx, user.id);
      await tx.debateRound.deleteMany({ where: { debateId: id } });
      await tx.debateEvent.deleteMany({ where: { debateId: id } });

      const updated = await tx.debate.update({
        where: { id },
        data: {
          status: DebateStatus.PENDING,
          currentThesis: debate.originalThesis,
          roundCount: 0,
          layer1Summary: null,
          layer2Summary: null,
          finalSummary: null,
          finalThesis: null,
          completedAt: null,
        },
      });

      await tx.debateEvent.create({
        data: {
          debateId: id,
          type: 'RESTARTED',
          payload: { previousStatus: debate.status },
        },
      });

      return updated;
    });

    try {
      await this.enqueueDebate(restarted, user.id, true);
    } catch (error) {
      await this.failDebateAndRefund(restarted.id, user.id, error);
    }

    return { debateId: restarted.id };
  }

  stream(id: string, user?: AuthenticatedUser): Observable<MessageEvent> {
    let lastSeenAt: Date | null = null;

    return interval(1000).pipe(
      startWith(0),
      switchMap(() => from(this.getEventBatch(id, user, lastSeenAt))),
      mergeMap((events) => {
        if (events.length > 0) {
          lastSeenAt = events[events.length - 1].createdAt;
        }

        return from(events);
      }),
      map((event) => ({
        type: event.type,
        data: event,
      })),
    );
  }

  private async enqueueDebate(
    debate: Debate,
    userId: string,
    restart: boolean,
  ) {
    const job = await this.debatesQueue.add(
      RUN_DEBATE_JOB,
      {
        debateId: debate.id,
        userId,
        restart,
      },
      {
        jobId: `${RUN_DEBATE_JOB}:${debate.id}:${Date.now()}`,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );

    await this.prisma.debateEvent.create({
      data: {
        debateId: debate.id,
        type: 'QUEUED',
        payload: { jobId: job.id, restart },
      },
    });
  }

  private async getEventBatch(
    debateId: string,
    user?: AuthenticatedUser,
    lastSeenAt?: Date | null,
  ) {
    await this.assertReadable(debateId, user);

    return this.prisma.debateEvent.findMany({
      where: {
        debateId,
        ...(lastSeenAt ? { createdAt: { gt: lastSeenAt } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
  }

  private async assertReadable(debateId: string, user?: AuthenticatedUser) {
    const debate = await this.prisma.debate.findFirst({
      where: {
        id: debateId,
        ...this.readableWhere(user),
      },
      select: { id: true },
    });

    if (!debate) {
      throw new NotFoundException('Debate not found');
    }
  }

  private readableWhere(user?: AuthenticatedUser): Prisma.DebateWhereInput {
    if (user?.role === UserRole.ADMIN) {
      return {};
    }

    if (user) {
      return {
        OR: [{ visibility: Visibility.PUBLIC }, { userId: user.id }],
      };
    }

    return { visibility: Visibility.PUBLIC };
  }

  private assertCanManage(debate: Debate, user: AuthenticatedUser) {
    if (user.role === UserRole.ADMIN || debate.userId === user.id) {
      return;
    }

    throw new ForbiddenException('You cannot manage this debate');
  }

  private async chargeCredit(tx: Prisma.TransactionClient, userId: string) {
    const charged = await tx.user.updateMany({
      where: {
        id: userId,
        balanceCredits: { gte: 1 },
      },
      data: {
        balanceCredits: { decrement: 1 },
      },
    });

    if (charged.count !== 1) {
      throw new HttpException('Not enough credits', HttpStatus.PAYMENT_REQUIRED);
    }
  }

  private async failDebateAndRefund(
    debateId: string,
    userId: string,
    error: unknown,
  ): Promise<never> {
    const reason =
      error instanceof Error ? error.message : 'Unknown queue error';

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { balanceCredits: { increment: 1 } },
      }),
      this.prisma.debate.update({
        where: { id: debateId },
        data: { status: DebateStatus.FAILED },
      }),
      this.prisma.debateEvent.create({
        data: {
          debateId,
          type: 'FAILED',
          payload: { reason: 'QUEUE_UNAVAILABLE', detail: reason },
        },
      }),
    ]);

    throw new ServiceUnavailableException('Debate queue is unavailable');
  }

  private makeTitle(thesis: string): string {
    return thesis.trim().slice(0, 96);
  }

  private makeSlug(thesis: string): string {
    const base = thesis
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);

    return `${base || 'debate'}-${randomUUID().slice(0, 8)}`;
  }
}
