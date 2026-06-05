import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DebateStatus,
  HumanInjection,
  InjectionStatus,
  NotificationChannel,
  NotificationType,
} from '@prisma/client';
import { Queue } from 'bullmq';
import { createHmac, timingSafeEqual } from 'crypto';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import {
  NOTIFICATION_QUEUE,
  SEND_NOTIFICATION_JOB,
} from '../debates/debates.constants';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramConnectDto } from './dto/telegram-connect.dto';

export type TelegramNotificationTrigger =
  | 'DEBATE_COMPLETED'
  | 'HUMAN_INJECTION_ACCEPTED'
  | 'DEBATE_FAILED';

export type TelegramNotificationJobData = {
  userId: string;
  trigger: TelegramNotificationTrigger;
  message: string;
  debateId?: string;
  injectionId?: string;
};

export type TelegramWebhookUpdate = {
  message?: TelegramWebhookMessage;
  edited_message?: TelegramWebhookMessage;
};

type TelegramWebhookMessage = {
  message_id?: number;
  text?: string;
  chat?: {
    id?: number | string;
    type?: string;
  };
};

type DebateNotificationSource = {
  id: string;
  userId: string;
  title: string | null;
  originalThesis: string;
  roundCount: number;
  status: DebateStatus;
};

type InjectionWithDebate = Pick<
  HumanInjection,
  'id' | 'userId' | 'content' | 'status'
> & {
  debate: {
    id: string;
    title: string | null;
    originalThesis: string;
  };
};

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly connectTokenTtlMs = 15 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue(NOTIFICATION_QUEUE)
    private readonly notificationQueue: Queue<TelegramNotificationJobData>,
  ) {}

  async connect(user: AuthenticatedUser, dto: TelegramConnectDto) {
    const chatId = dto?.chatId?.trim();

    if (chatId) {
      const channel = await this.activateTelegramChannel(user.id, chatId);

      return {
        connected: true,
        channel: this.toChannelResponse(channel),
      };
    }

    const expiresAt = new Date(Date.now() + this.connectTokenTtlMs);
    const token = this.createConnectToken(user.id, expiresAt);

    return {
      connected: false,
      token,
      connectUrl: this.buildConnectUrl(token),
      expiresAt,
    };
  }

  async disconnect(user: AuthenticatedUser) {
    const result = await this.prisma.notificationChannel.updateMany({
      where: {
        userId: user.id,
        type: NotificationType.TELEGRAM,
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });

    return {
      disconnected: result.count > 0,
      count: result.count,
    };
  }

  async handleWebhook(
    update: TelegramWebhookUpdate,
    webhookSecret?: string,
  ) {
    this.assertWebhookSecret(webhookSecret);

    const message = update.message ?? update.edited_message;
    const chatId = message?.chat?.id;
    const text = message?.text?.trim();

    if (chatId === undefined || chatId === null || !text) {
      return { ok: true, handled: false };
    }

    const token = this.extractStartToken(text);
    if (!token) {
      return { ok: true, handled: false };
    }

    let userId: string;
    try {
      userId = this.verifyConnectToken(token);
    } catch (error) {
      await this.sendTelegramMessage(
        String(chatId),
        'Telegram connection link is invalid or expired.',
      );

      if (error instanceof BadRequestException) {
        return { ok: true, handled: true, connected: false };
      }

      throw error;
    }

    const channel = await this.activateTelegramChannel(userId, String(chatId));
    await this.sendTelegramMessage(
      String(chatId),
      'Telegram notifications connected.',
    );

    return {
      ok: true,
      handled: true,
      connected: true,
      channelId: channel.id,
    };
  }

  async notifyDebateCompleted(debateId: string): Promise<void> {
    await this.runNotification('debate completed', async () => {
      const debate = await this.prisma.debate.findUnique({
        where: { id: debateId },
        select: {
          id: true,
          userId: true,
          title: true,
          originalThesis: true,
          roundCount: true,
          status: true,
        },
      });

      if (!debate || debate.status !== DebateStatus.COMPLETED) {
        return;
      }

      await this.enqueueNotification({
        userId: debate.userId,
        trigger: 'DEBATE_COMPLETED',
        debateId: debate.id,
        message: [
          'Debate completed',
          `Title: ${this.debateTitle(debate)}`,
          `Rounds: ${debate.roundCount}`,
        ].join('\n'),
      });
    });
  }

  async notifyDebateFailed(
    debateId: string,
    reason?: string,
  ): Promise<void> {
    await this.runNotification('debate failed', async () => {
      const debate = await this.prisma.debate.findUnique({
        where: { id: debateId },
        select: {
          id: true,
          userId: true,
          title: true,
          originalThesis: true,
          roundCount: true,
          status: true,
        },
      });

      if (!debate || debate.status !== DebateStatus.FAILED) {
        return;
      }

      await this.enqueueNotification({
        userId: debate.userId,
        trigger: 'DEBATE_FAILED',
        debateId: debate.id,
        message: [
          'Debate failed',
          `Title: ${this.debateTitle(debate)}`,
          reason ? `Reason: ${this.truncate(reason, 500)}` : null,
        ]
          .filter((line): line is string => Boolean(line))
          .join('\n'),
      });
    });
  }

  async notifyHumanInjectionAccepted(injectionId: string): Promise<void> {
    await this.runNotification('human injection accepted', async () => {
      const injection = await this.prisma.humanInjection.findUnique({
        where: { id: injectionId },
        select: {
          id: true,
          userId: true,
          content: true,
          status: true,
          debate: {
            select: {
              id: true,
              title: true,
              originalThesis: true,
            },
          },
        },
      });

      if (
        !injection ||
        (injection.status !== InjectionStatus.ACCEPTED &&
          injection.status !== InjectionStatus.USED_IN_ROUND)
      ) {
        return;
      }

      await this.enqueueNotification({
        userId: injection.userId,
        trigger: 'HUMAN_INJECTION_ACCEPTED',
        debateId: injection.debate.id,
        injectionId: injection.id,
        message: [
          'Human injection accepted',
          `Debate: ${this.injectionDebateTitle(injection)}`,
          `Injection: ${this.truncate(injection.content, 500)}`,
        ].join('\n'),
      });
    });
  }

  async sendNotification(job: TelegramNotificationJobData) {
    const channels = await this.prisma.notificationChannel.findMany({
      where: {
        userId: job.userId,
        type: NotificationType.TELEGRAM,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (channels.length === 0) {
      this.logger.debug(`No active Telegram channel for user ${job.userId}`);
      return { sent: 0, total: 0 };
    }

    if (!this.botToken) {
      this.logger.warn(
        'TELEGRAM_BOT_TOKEN is not configured; Telegram notification skipped',
      );
      return { sent: 0, total: channels.length };
    }

    let sent = 0;
    for (const channel of channels) {
      try {
        await this.sendTelegramMessage(channel.value, job.message);
        sent += 1;
      } catch (error) {
        this.logger.error(
          `Telegram notification failed for channel ${channel.id}: ${this.errorMessage(error)}`,
        );
      }
    }

    return { sent, total: channels.length };
  }

  private async enqueueNotification(
    data: TelegramNotificationJobData,
  ): Promise<void> {
    try {
      await this.notificationQueue.add(SEND_NOTIFICATION_JOB, data, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: 100,
      });
    } catch (error) {
      this.logger.warn(
        `Telegram notification enqueue failed: ${this.errorMessage(error)}`,
      );
    }
  }

  private async runNotification(
    name: string,
    work: () => Promise<void>,
  ): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.logger.warn(
        `Telegram ${name} notification failed: ${this.errorMessage(error)}`,
      );
    }
  }

  private async activateTelegramChannel(
    userId: string,
    chatId: string,
  ): Promise<NotificationChannel> {
    const existing = await this.prisma.notificationChannel.findFirst({
      where: {
        userId,
        type: NotificationType.TELEGRAM,
        value: chatId,
      },
      orderBy: { createdAt: 'desc' },
    });

    const channel = existing
      ? await this.prisma.notificationChannel.update({
          where: { id: existing.id },
          data: { isActive: true },
        })
      : await this.prisma.notificationChannel.create({
          data: {
            userId,
            type: NotificationType.TELEGRAM,
            value: chatId,
          },
        });

    await this.prisma.notificationChannel.updateMany({
      where: {
        userId,
        type: NotificationType.TELEGRAM,
        isActive: true,
        NOT: {
          id: channel.id,
        },
      },
      data: {
        isActive: false,
      },
    });

    return channel;
  }

  private async sendTelegramMessage(
    chatId: string,
    text: string,
  ): Promise<void> {
    const token = this.botToken;
    if (!token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN is not configured');
      return;
    }

    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: this.truncate(text, 4096),
          disable_web_page_preview: true,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Telegram sendMessage failed with ${response.status}: ${await response.text()}`,
      );
    }
  }

  private createConnectToken(userId: string, expiresAt: Date): string {
    const expiresAtBase36 = expiresAt.getTime().toString(36);
    const payload = `${userId}_${expiresAtBase36}`;
    const signature = this.signPayload(payload);

    return `${payload}_${signature}`;
  }

  private verifyConnectToken(token: string): string {
    const [userId, expiresAtBase36, signature, ...rest] = token.split('_');

    if (
      !userId ||
      !expiresAtBase36 ||
      !signature ||
      rest.length > 0
    ) {
      throw new BadRequestException('Invalid Telegram connect token');
    }

    const payload = `${userId}_${expiresAtBase36}`;
    if (!this.signatureMatches(payload, signature)) {
      throw new BadRequestException('Invalid Telegram connect token');
    }

    const expiresAt = Number.parseInt(expiresAtBase36, 36);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      throw new BadRequestException('Expired Telegram connect token');
    }

    return userId;
  }

  private signPayload(payload: string): string {
    return createHmac('sha256', this.connectSecret)
      .update(payload)
      .digest('hex')
      .slice(0, 16);
  }

  private signatureMatches(payload: string, signature: string): boolean {
    const expected = Buffer.from(this.signPayload(payload));
    const actual = Buffer.from(signature);

    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private extractStartToken(text: string): string | null {
    const match = text.match(/^\/start(?:@\S+)?(?:\s+(.+))?$/);

    return match?.[1]?.trim() || null;
  }

  private assertWebhookSecret(webhookSecret?: string): void {
    const expected = this.config.get<string>('TELEGRAM_WEBHOOK_SECRET');

    if (expected && webhookSecret !== expected) {
      throw new UnauthorizedException('Invalid Telegram webhook secret');
    }
  }

  private buildConnectUrl(token: string): string | null {
    const username = this.config
      .get<string>('TELEGRAM_BOT_USERNAME')
      ?.trim()
      .replace(/^@/, '');

    if (!username) {
      return null;
    }

    return `https://t.me/${username}?start=${encodeURIComponent(token)}`;
  }

  private toChannelResponse(channel: NotificationChannel) {
    return {
      id: channel.id,
      type: channel.type,
      chatId: channel.value,
      isActive: channel.isActive,
      createdAt: channel.createdAt,
    };
  }

  private debateTitle(debate: DebateNotificationSource): string {
    return this.truncate(debate.title || debate.originalThesis, 160);
  }

  private injectionDebateTitle(injection: InjectionWithDebate): string {
    return this.truncate(
      injection.debate.title || injection.debate.originalThesis,
      160,
    );
  }

  private truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }

  private get connectSecret(): string {
    return (
      this.config.get<string>('TELEGRAM_CONNECT_SECRET') ||
      this.config.get<string>('JWT_ACCESS_SECRET') ||
      'development-telegram-connect-secret'
    );
  }

  private get botToken(): string {
    return this.config.get<string>('TELEGRAM_BOT_TOKEN') || '';
  }
}
