import { InjectQueue } from '@nestjs/bullmq';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  MessageEvent,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AiAgentName,
  Debate,
  DebateAiModel,
  DebateEventType,
  DebateMode,
  DebateStatus,
  HumanInjection,
  InjectionStatus,
  Prisma,
  UserRole,
  Visibility,
} from '@prisma/client';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { concat, defer, from, Observable } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { BillingService } from '../billing/billing.service';
import { DebateLiveEventsService } from '../debate-events/debate-live-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { DEBATE_QUEUE, RUN_DEBATE_JOB } from './debates.constants';
import { CreateDebateDto } from './dto/create-debate.dto';
import { CreateDebateFromUrlDto } from './dto/create-debate-from-url.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreateInjectionDto } from './dto/create-injection.dto';
import { ModeDetectionService } from './services/mode-detection.service';
import { UrlParserService } from './services/url-parser.service';
import { DebateJobData } from './types/debate-job-data.type';

@Injectable()
export class DebatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
    private readonly liveEvents: DebateLiveEventsService,
    private readonly telegramService: TelegramService,
    private readonly urlParser: UrlParserService,
    private readonly modeDetection: ModeDetectionService,
    @InjectQueue(DEBATE_QUEUE)
    private readonly debateQueue: Queue<DebateJobData>,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateDebateDto) {
    const visibility = dto.visibility ?? Visibility.PUBLIC;
    const creditCost = this.getDebateCreditCost(visibility);
    const debate = await this.prisma.$transaction(async (tx) => {
      await this.billingService.debit(
        tx,
        user.id,
        creditCost,
        visibility === Visibility.PRIVATE ? 'PRIVATE_DEBATE' : 'DEBATE',
      );

      const created = await tx.debate.create({
        data: {
          userId: user.id,
          title: this.makeTitle(dto.thesis),
          slug: this.makeSlug(dto.thesis),
          originalThesis: dto.thesis,
          currentThesis: dto.thesis,
          mode: dto.mode ?? DebateMode.CONVERGENT,
          visibility,
          models: dto.models,
          maxRounds: dto.maxRounds ?? 6,
          quietMode: dto.quietMode ?? false,
          sourceUrl: dto.sourceUrl,
        },
      });

      await tx.debateEvent.create({
        data: {
          debateId: created.id,
          type: DebateEventType.HUMAN,
          content: dto.thesis,
          metadata: {
            action: 'CREATED',
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
      await this.failDebateAndRefund(debate.id, user.id, creditCost, error);
    }

    return { debateId: debate.id };
  }

  detectMode(thesis: string) {
    return this.modeDetection.detect(thesis);
  }

  async createFromUrl(user: AuthenticatedUser, dto: CreateDebateFromUrlDto) {
    const thesis = await this.urlParser.extractThesis(dto.url, user.id);
    return this.create(user, {
      thesis,
      mode: dto.mode ?? DebateMode.CONVERGENT,
      visibility: dto.visibility ?? Visibility.PUBLIC,
      models: dto.models ?? [DebateAiModel.GPT, DebateAiModel.CLAUDE, DebateAiModel.GEMINI, DebateAiModel.GROK],
      maxRounds: dto.maxRounds,
      quietMode: false,
      sourceUrl: dto.url,
    });
  }

  async createBranch(
    parentId: string,
    user: AuthenticatedUser,
    dto: CreateBranchDto,
  ) {
    const parent = await this.prisma.debate.findFirst({
      where: { id: parentId, ...this.readableWhere(user) },
      select: {
        id: true,
        userId: true,
        childQuestions: true,
        mode: true,
        visibility: true,
        models: true,
        maxRounds: true,
      },
    });

    if (!parent) {
      throw new NotFoundException('Parent debate not found');
    }

    const question = parent.childQuestions[dto.questionIndex];
    if (!question) {
      throw new NotFoundException(
        `Child question at index ${dto.questionIndex} does not exist`,
      );
    }

    const creditCost = this.getDebateCreditCost(parent.visibility);
    const debate = await this.prisma.$transaction(async (tx) => {
      await this.billingService.debit(tx, user.id, creditCost, 'BRANCH_DEBATE');

      const created = await tx.debate.create({
        data: {
          userId: user.id,
          title: this.makeTitle(question),
          slug: this.makeSlug(question),
          originalThesis: question,
          currentThesis: question,
          mode: parent.mode,
          visibility: parent.visibility,
          models: parent.models,
          maxRounds: parent.maxRounds,
          parentId: parent.id,
          branchQuestion: question,
        },
      });

      await tx.debateEvent.create({
        data: {
          debateId: created.id,
          type: DebateEventType.HUMAN,
          content: question,
          metadata: {
            action: 'CREATED',
            parentId: parent.id,
            branchQuestionIndex: dto.questionIndex,
          },
        },
      });

      return created;
    });

    try {
      await this.enqueueDebate(debate, user.id, false);
    } catch (error) {
      await this.failDebateAndRefund(debate.id, user.id, creditCost, error);
    }

    return { debateId: debate.id, parentId: parent.id, question };
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
          orderBy: [{ roundNumber: 'asc' }, { startedAt: 'asc' }],
        },
        events: {
          orderBy: { createdAt: 'asc' },
        },
        branches: {
          select: { id: true, title: true, slug: true, status: true, createdAt: true },
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
        opportunityScore: true,
        childQuestions: true,
        researchGaps: true,
        crossDomainHypotheses: true,
        completedAt: true,
      },
    });

    if (!debate) {
      throw new NotFoundException('Debate not found');
    }

    return debate;
  }

  async getInsights(debateId: string, user?: AuthenticatedUser) {
    await this.assertReadable(debateId, user);
    return this.prisma.exploreInsight.findMany({
      where: { debateId },
      orderBy: { createdAt: 'asc' },
    });
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

    const creditCost = this.getDebateCreditCost(debate.visibility);
    const restarted = await this.prisma.$transaction(async (tx) => {
      await this.billingService.debit(
        tx,
        user.id,
        creditCost,
        debate.visibility === Visibility.PRIVATE
          ? 'PRIVATE_DEBATE_RESTART'
          : 'DEBATE_RESTART',
      );
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
          type: DebateEventType.HUMAN,
          content: 'Debate restarted',
          metadata: {
            action: 'RESTARTED',
            previousStatus: debate.status,
          },
        },
      });

      return updated;
    });

    try {
      await this.enqueueDebate(restarted, user.id, true);
    } catch (error) {
      await this.failDebateAndRefund(
        restarted.id,
        user.id,
        creditCost,
        error,
      );
    }

    return { debateId: restarted.id };
  }

  async createInjection(
    debateId: string,
    user: AuthenticatedUser,
    dto: CreateInjectionDto,
  ) {
    const debate = await this.getReadableDebateWithOwner(debateId, user);
    const autoAccepted = debate.userId === user.id;
    const acceptedAt = autoAccepted ? new Date() : null;
    const content = dto.content.trim();

    const result = await this.prisma.$transaction(async (tx) => {
      if (autoAccepted) {
        await this.billingService.debit(
          tx,
          user.id,
          1,
          'INSTANT_INJECTION',
        );
      }

      const injection = await tx.humanInjection.create({
        data: {
          debateId,
          userId: user.id,
          type: dto.type,
          content,
          status: autoAccepted
            ? InjectionStatus.ACCEPTED
            : InjectionStatus.PENDING,
          acceptedAt,
        },
      });

      const event = autoAccepted
        ? await this.createAcceptedInjectionEvent(tx, injection)
        : null;

      return { injection, event };
    });

    if (result.event) {
      this.liveEvents.emit(result.event);
      await this.telegramService.notifyHumanInjectionAccepted(
        result.injection.id,
      );
    }

    return result.injection;
  }

  async listInjections(debateId: string, user?: AuthenticatedUser) {
    await this.assertReadable(debateId, user);

    return this.prisma.humanInjection.findMany({
      where: { debateId },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            role: true,
          },
        },
      },
    });
  }

  async likeInjection(id: string, user: AuthenticatedUser) {
    const injection = await this.prisma.humanInjection.findUnique({
      where: { id },
      select: { id: true, debateId: true },
    });

    if (!injection) {
      throw new NotFoundException('Injection not found');
    }

    await this.assertReadable(injection.debateId, user);

    return this.prisma.humanInjection.update({
      where: { id },
      data: {
        likesCount: { increment: 1 },
      },
    });
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

    const result = await this.prisma.$transaction(async (tx) => {
      const injection = await tx.humanInjection.update({
        where: { id },
        data: {
          status: InjectionStatus.ACCEPTED,
          acceptedAt: new Date(),
        },
      });
      const event = await this.createAcceptedInjectionEvent(tx, injection);

      return { injection, event };
    });

    this.liveEvents.emit(result.event);
    await this.telegramService.notifyHumanInjectionAccepted(
      result.injection.id,
    );

    return result.injection;
  }

  async createComment(
    debateId: string,
    user: AuthenticatedUser,
    dto: CreateCommentDto,
  ) {
    await this.assertReadable(debateId, user);

    if (dto.parentId) {
      await this.assertParentCommentBelongsToDebate(dto.parentId, debateId);
    }

    return this.prisma.comment.create({
      data: {
        debateId,
        userId: user.id,
        parentId: dto.parentId,
        content: dto.content.trim(),
      },
      include: this.commentInclude(),
    });
  }

  async listComments(debateId: string, user?: AuthenticatedUser) {
    await this.assertReadable(debateId, user);

    return this.prisma.comment.findMany({
      where: { debateId },
      orderBy: { createdAt: 'asc' },
      include: this.commentInclude(),
    });
  }

  async likeComment(id: string, user: AuthenticatedUser) {
    const comment = await this.prisma.comment.findUnique({
      where: { id },
      select: { id: true, debateId: true },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    await this.assertReadable(comment.debateId, user);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.commentLike.create({
          data: {
            commentId: id,
            userId: user.id,
          },
        });

        return tx.comment.update({
          where: { id },
          data: {
            likesCount: { increment: 1 },
          },
          include: this.commentInclude(),
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.prisma.comment.findUnique({
          where: { id },
          include: this.commentInclude(),
        });
      }

      throw error;
    }
  }

  async deleteComment(id: string, user: AuthenticatedUser) {
    const comment = await this.prisma.comment.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    if (user.role !== UserRole.ADMIN && comment.userId !== user.id) {
      throw new ForbiddenException('You cannot delete this comment');
    }

    await this.prisma.comment.delete({ where: { id } });

    return { deleted: true };
  }

  stream(id: string, user?: AuthenticatedUser): Observable<MessageEvent> {
    const history$ = defer(() => from(this.getEventBatch(id, user))).pipe(
      mergeMap((events) =>
        from(
          events
            .map((event) => this.liveEvents.toMessage(event))
            .filter((event): event is MessageEvent => Boolean(event)),
        ),
      ),
    );

    return concat(history$, this.liveEvents.stream(id));
  }

  private async enqueueDebate(
    debate: Debate,
    userId: string,
    restart: boolean,
  ) {
    const job = await this.debateQueue.add(
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
        type: DebateEventType.SYSTEM,
        agent: AiAgentName.SYSTEM,
        content: 'Debate queued',
        metadata: {
          action: 'QUEUED',
          jobId: job.id,
          restart,
        },
      },
    });
  }

  private createAcceptedInjectionEvent(
    tx: Prisma.TransactionClient,
    injection: HumanInjection,
  ) {
    return tx.debateEvent.create({
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
        },
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

  private async getReadableDebateWithOwner(
    debateId: string,
    user?: AuthenticatedUser,
  ) {
    const debate = await this.prisma.debate.findFirst({
      where: {
        id: debateId,
        ...this.readableWhere(user),
      },
      select: { id: true, userId: true },
    });

    if (!debate) {
      throw new NotFoundException('Debate not found');
    }

    return debate;
  }

  private async assertParentCommentBelongsToDebate(
    parentId: string,
    debateId: string,
  ) {
    const parent = await this.prisma.comment.findFirst({
      where: {
        id: parentId,
        debateId,
      },
      select: { id: true },
    });

    if (!parent) {
      throw new NotFoundException('Parent comment not found');
    }
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

  private commentInclude() {
    return {
      user: {
        select: {
          id: true,
          username: true,
          avatarUrl: true,
          role: true,
        },
      },
    } satisfies Prisma.CommentInclude;
  }

  private getDebateCreditCost(visibility: Visibility): number {
    return visibility === Visibility.PRIVATE ? 5 : 1;
  }

  private async failDebateAndRefund(
    debateId: string,
    userId: string,
    refundAmount: number,
    error: unknown,
  ): Promise<never> {
    const reason =
      error instanceof Error ? error.message : 'Unknown queue error';

    const event = await this.prisma.$transaction(async (tx) => {
      await this.billingService.credit(
        tx,
        userId,
        refundAmount,
        'QUEUE_UNAVAILABLE_REFUND',
      );
      await tx.debate.update({
        where: { id: debateId },
        data: { status: DebateStatus.FAILED },
      });

      return tx.debateEvent.create({
        data: {
          debateId,
          type: DebateEventType.SYSTEM,
          agent: AiAgentName.SYSTEM,
          content: 'QUEUE_UNAVAILABLE',
          metadata: {
            action: 'FAILED',
            reason: 'QUEUE_UNAVAILABLE',
            detail: reason,
          },
        },
      });
    });

    this.liveEvents.emit(event);
    await this.telegramService.notifyDebateFailed(debateId, reason);

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
