import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreditTransactionType, Prisma } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { BillingWebhookDto } from './dto/billing-webhook.dto';
import { CheckoutDto } from './dto/checkout.dto';
import {
  CREDIT_PACKAGES,
  CreateStripeSessionDto,
} from './dto/create-stripe-session.dto';

type StripeCheckoutSession = {
  id: string;
  url: string;
};

type StripeEvent = {
  type: string;
  data: {
    object: {
      id: string;
      metadata?: {
        userId?: string;
        credits?: string;
        package?: string;
      };
      payment_status?: string;
    };
  };
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getBalance(user: AuthenticatedUser) {
    const current = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        balanceCredits: true,
        freeDebatesLeft: true,
      },
    });

    return {
      balanceCredits: current?.balanceCredits ?? user.balanceCredits,
      freeDebatesLeft: current?.freeDebatesLeft ?? user.freeDebatesLeft,
    };
  }

  listTransactions(user: AuthenticatedUser) {
    return this.prisma.creditTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  checkout(user: AuthenticatedUser, dto: CheckoutDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.credit(
        tx,
        user.id,
        dto.amount,
        'CHECKOUT',
        dto.stripePaymentId,
      );

      return this.getBalanceAfterTransaction(tx, user.id);
    });
  }

  webhook(dto: BillingWebhookDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.credit(
        tx,
        dto.userId,
        dto.amount,
        'STRIPE_WEBHOOK',
        dto.stripePaymentId,
      );

      return this.getBalanceAfterTransaction(tx, dto.userId);
    });
  }

  async createStripeSession(
    user: AuthenticatedUser,
    dto: CreateStripeSessionDto,
  ): Promise<{ url: string }> {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      throw new HttpException('Stripe not configured', HttpStatus.SERVICE_UNAVAILABLE);
    }

    const pkg = CREDIT_PACKAGES[dto.package];
    const params = new URLSearchParams({
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][product_data][name]': `Mind Arena — ${pkg.label}`,
      'line_items[0][price_data][unit_amount]': String(pkg.amountCents),
      'line_items[0][quantity]': '1',
      mode: 'payment',
      success_url: dto.successUrl,
      cancel_url: dto.cancelUrl,
      'metadata[userId]': user.id,
      'metadata[credits]': String(pkg.credits),
      'metadata[package]': dto.package,
    });

    const response = await fetch(
      'https://api.stripe.com/v1/checkout/sessions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      },
    );

    if (!response.ok) {
      const detail = await response.text();
      this.logger.error(`Stripe session creation failed: ${detail}`);
      throw new HttpException('Payment session creation failed', HttpStatus.BAD_GATEWAY);
    }

    const session = (await response.json()) as StripeCheckoutSession;
    return { url: session.url };
  }

  async handleStripeWebhook(
    rawBody: Buffer,
    signature: string,
  ): Promise<{ received: boolean }> {
    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      throw new HttpException('Stripe webhook not configured', HttpStatus.SERVICE_UNAVAILABLE);
    }

    const event = this.verifyStripeSignature(rawBody, signature, webhookSecret);

    if (event.type !== 'checkout.session.completed') {
      return { received: true };
    }

    const session = event.data.object;
    if (session.payment_status !== 'paid') {
      return { received: true };
    }

    const userId = session.metadata?.userId;
    const creditsRaw = session.metadata?.credits;

    if (!userId || !creditsRaw) {
      this.logger.warn(`Stripe webhook missing metadata: ${JSON.stringify(session.metadata)}`);
      return { received: true };
    }

    const credits = parseInt(creditsRaw, 10);
    if (!Number.isFinite(credits) || credits <= 0) {
      return { received: true };
    }

    await this.prisma.$transaction(async (tx) => {
      await this.credit(tx, userId, credits, 'STRIPE_CHECKOUT', session.id);
    });

    return { received: true };
  }

  private verifyStripeSignature(
    rawBody: Buffer,
    signatureHeader: string,
    secret: string,
  ): StripeEvent {
    const parts = signatureHeader.split(',');
    const tPart = parts.find((p) => p.startsWith('t='));
    const v1Part = parts.find((p) => p.startsWith('v1='));

    if (!tPart || !v1Part) {
      throw new UnauthorizedException('Invalid Stripe signature format');
    }

    const timestamp = tPart.slice(2);
    const expectedSig = v1Part.slice(3);
    const payload = `${timestamp}.${rawBody.toString('utf8')}`;
    const hmac = createHmac('sha256', secret).update(payload).digest('hex');

    const expectedBuf = Buffer.from(expectedSig, 'hex');
    const computedBuf = Buffer.from(hmac, 'hex');

    if (
      expectedBuf.length !== computedBuf.length ||
      !timingSafeEqual(expectedBuf, computedBuf)
    ) {
      throw new UnauthorizedException('Stripe signature verification failed');
    }

    const tsDiff = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (tsDiff > 300) {
      throw new UnauthorizedException('Stripe webhook timestamp too old');
    }

    return JSON.parse(rawBody.toString('utf8')) as StripeEvent;
  }

  async debit(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: number,
    reason: string,
  ): Promise<void> {
    const charged = await tx.user.updateMany({
      where: {
        id: userId,
        balanceCredits: { gte: amount },
      },
      data: {
        balanceCredits: { decrement: amount },
      },
    });

    if (charged.count !== 1) {
      throw new HttpException('Not enough credits', HttpStatus.PAYMENT_REQUIRED);
    }

    await tx.creditTransaction.create({
      data: {
        userId,
        type: CreditTransactionType.DEBIT,
        amount,
        reason,
      },
    });
  }

  async credit(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: number,
    reason: string,
    stripePaymentId?: string,
  ): Promise<void> {
    await tx.user.update({
      where: { id: userId },
      data: {
        balanceCredits: { increment: amount },
      },
    });

    await tx.creditTransaction.create({
      data: {
        userId,
        type: CreditTransactionType.CREDIT,
        amount,
        reason,
        stripePaymentId,
      },
    });
  }

  private async getBalanceAfterTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
  ) {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        balanceCredits: true,
        freeDebatesLeft: true,
      },
    });

    return {
      balanceCredits: user?.balanceCredits ?? 0,
      freeDebatesLeft: user?.freeDebatesLeft ?? 0,
    };
  }
}
