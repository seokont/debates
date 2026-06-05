import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { CreditTransactionType, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { BillingWebhookDto } from './dto/billing-webhook.dto';
import { CheckoutDto } from './dto/checkout.dto';

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

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
