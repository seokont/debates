import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LicenseType } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { BillingService } from '../billing/billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccessLicenseDto } from './dto/access-license.dto';
import { CreateLicenseDto } from './dto/create-license.dto';

@Injectable()
export class DataLicensingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
  ) {}

  async createLicense(user: AuthenticatedUser, dto: CreateLicenseDto) {
    const debate = await this.prisma.debate.findFirst({
      where: { id: dto.debateId, userId: user.id, status: 'COMPLETED' },
      select: { id: true },
    });

    if (!debate) {
      throw new NotFoundException('Completed debate not found or you are not the author');
    }

    const existing = await this.prisma.dataLicense.findUnique({ where: { debateId: dto.debateId } });
    if (existing) throw new ConflictException('This debate already has a license');

    return this.prisma.dataLicense.create({
      data: {
        debateId: dto.debateId,
        userId: user.id,
        title: dto.title,
        description: dto.description,
        licenseType: dto.licenseType ?? LicenseType.CC_BY,
        priceCredits: dto.priceCredits ?? 0,
      },
    });
  }

  async publishLicense(id: string, userId: string) {
    const license = await this.prisma.dataLicense.findFirst({ where: { id, userId } });
    if (!license) throw new NotFoundException('License not found');
    if (license.isPublished) throw new BadRequestException('Already published');

    return this.prisma.dataLicense.update({
      where: { id },
      data: { isPublished: true, publishedAt: new Date() },
    });
  }

  async unpublishLicense(id: string, userId: string) {
    const license = await this.prisma.dataLicense.findFirst({ where: { id, userId } });
    if (!license) throw new NotFoundException('License not found');

    return this.prisma.dataLicense.update({
      where: { id },
      data: { isPublished: false },
    });
  }

  listMarketplace() {
    return this.prisma.dataLicense.findMany({
      where: { isPublished: true },
      orderBy: [{ totalUses: 'desc' }, { publishedAt: 'desc' }],
      take: 50,
      select: {
        id: true,
        title: true,
        description: true,
        licenseType: true,
        priceCredits: true,
        totalUses: true,
        publishedAt: true,
        debate: { select: { id: true, slug: true, opportunityScore: true, childQuestions: true } },
        user: { select: { username: true } },
      },
    });
  }

  async accessLicense(id: string, user: AuthenticatedUser, dto: AccessLicenseDto) {
    const license = await this.prisma.dataLicense.findFirst({
      where: { id, isPublished: true },
    });

    if (!license) throw new NotFoundException('License not found in marketplace');

    if (license.userId === user.id) {
      throw new ForbiddenException('Cannot access your own license — you already own the data');
    }

    const alreadyAccessed = await this.prisma.dataLicenseUsage.findFirst({
      where: { licenseId: id, userId: user.id },
    });
    if (alreadyAccessed) {
      return { alreadyAccessed: true, licenseId: id };
    }

    if (license.priceCredits > 0) {
      await this.prisma.$transaction(async (tx) => {
        await this.billingService.debit(tx, user.id, license.priceCredits, 'DATA_LICENSE_ACCESS');
        await this.billingService.credit(tx, license.userId, license.priceCredits, 'DATA_LICENSE_ROYALTY');
      });
    }

    const [usage] = await this.prisma.$transaction([
      this.prisma.dataLicenseUsage.create({
        data: { licenseId: id, userId: user.id, purpose: dto.purpose },
      }),
      this.prisma.dataLicense.update({
        where: { id },
        data: { totalUses: { increment: 1 } },
      }),
    ]);

    const debate = await this.prisma.debate.findUnique({
      where: { id: license.debateId },
      include: {
        rounds: { orderBy: { roundNumber: 'asc' }, take: 10 },
        events: { where: { type: { in: ['RESEARCH_GAP', 'FINAL'] } }, take: 20 },
      },
    });

    return { usage, debate };
  }

  myLicenses(userId: string) {
    return this.prisma.dataLicense.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        usages: { select: { id: true, userId: true, purpose: true, createdAt: true } },
        debate: { select: { slug: true, opportunityScore: true } },
      },
    });
  }
}
