import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { BillingService } from '../billing/billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { FundBranchDto } from './dto/fund-branch.dto';

const DEFAULT_EQUITY: Array<{ role: 'AUTHOR' | 'EXPERT' | 'BUILDER' | 'PLATFORM' | 'RESERVE'; percent: number; vestingDays: number }> = [
  { role: 'AUTHOR',   percent: 20, vestingDays: 0   },
  { role: 'EXPERT',   percent: 15, vestingDays: 90  },
  { role: 'BUILDER',  percent: 30, vestingDays: 180 },
  { role: 'PLATFORM', percent: 25, vestingDays: 0   },
  { role: 'RESERVE',  percent: 10, vestingDays: 365 },
];

@Injectable()
export class CrowdfundingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
  ) {}

  async fund(user: AuthenticatedUser, dto: FundBranchDto) {
    const debate = await this.prisma.debate.findFirst({
      where: { id: dto.debateId },
      select: { id: true, userId: true, status: true, visibility: true },
    });

    if (!debate) throw new NotFoundException('Debate not found');
    if (debate.status !== 'RUNNING' && debate.status !== 'COMPLETED') {
      throw new BadRequestException('Can only fund active or completed debates');
    }

    const royaltyPercent = dto.royaltyPercent ?? 5;

    const totalFunded = await this.prisma.branchFund.aggregate({
      where: { debateId: dto.debateId, status: 'ACTIVE' },
      _sum: { royaltyPercent: true },
    });

    const totalRoyalty = (totalFunded._sum.royaltyPercent ?? 0) + royaltyPercent;
    if (totalRoyalty > 49) {
      throw new BadRequestException(
        `Total royalty would exceed 49%. Currently ${totalFunded._sum.royaltyPercent ?? 0}% funded.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await this.billingService.debit(tx, user.id, dto.amountCredits, 'BRANCH_FUND');

      return tx.branchFund.create({
        data: {
          debateId: dto.debateId,
          userId: user.id,
          amountCredits: dto.amountCredits,
          royaltyPercent,
        },
      });
    });
  }

  async withdraw(fundId: string, user: AuthenticatedUser) {
    const fund = await this.prisma.branchFund.findFirst({
      where: { id: fundId, userId: user.id },
      include: { debate: { select: { status: true } } },
    });

    if (!fund) throw new NotFoundException('Fund not found');
    if (fund.status !== 'ACTIVE') throw new BadRequestException('Fund is not active');
    if (fund.debate.status === 'COMPLETED') {
      throw new BadRequestException('Cannot withdraw from a completed debate');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.billingService.credit(tx, user.id, fund.amountCredits, 'BRANCH_FUND_RETURN');
      return tx.branchFund.update({
        where: { id: fundId },
        data: { status: 'RETURNED', returnedAt: new Date() },
      });
    });
  }

  listForDebate(debateId: string) {
    return this.prisma.branchFund.findMany({
      where: { debateId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        amountCredits: true,
        royaltyPercent: true,
        status: true,
        createdAt: true,
        user: { select: { id: true, username: true, avatarUrl: true } },
      },
    });
  }

  listForUser(userId: string) {
    return this.prisma.branchFund.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        debate: { select: { title: true, slug: true, status: true, opportunityScore: true } },
      },
    });
  }

  async setEquityForProject(projectId: string, userId: string) {
    const project = await this.prisma.buildProject.findFirst({
      where: { id: projectId, userId },
      select: { id: true },
    });

    if (!project) throw new NotFoundException('Build project not found');

    const existing = await this.prisma.royaltyShare.count({ where: { projectId } });
    if (existing > 0) return { message: 'Equity already set' };

    await this.prisma.$transaction(
      DEFAULT_EQUITY.map((entry) =>
        this.prisma.royaltyShare.create({
          data: {
            projectId,
            userId,
            role: entry.role,
            percent: entry.percent,
            vestingDays: entry.vestingDays,
            isLocked: true,
          },
        }),
      ),
    );

    return this.prisma.royaltyShare.findMany({ where: { projectId } });
  }

  getEquity(projectId: string) {
    return this.prisma.royaltyShare.findMany({
      where: { projectId },
      orderBy: { percent: 'desc' },
    });
  }
}
