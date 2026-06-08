import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole, VerificationStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { ApplyExpertDto } from './dto/apply-expert.dto';
import { ReviewExpertDto } from './dto/review-expert.dto';

@Injectable()
export class ExpertService {
  constructor(private readonly prisma: PrismaService) {}

  async apply(user: AuthenticatedUser, dto: ApplyExpertDto) {
    const existing = await this.prisma.expertVerification.findFirst({
      where: { userId: user.id, status: VerificationStatus.PENDING },
    });

    if (existing) {
      throw new ConflictException('You already have a pending verification application');
    }

    return this.prisma.expertVerification.create({
      data: {
        userId: user.id,
        domain: dto.domain.trim(),
        evidence: dto.evidence.trim(),
      },
    });
  }

  myApplications(user: AuthenticatedUser) {
    return this.prisma.expertVerification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  listPending(admin: AuthenticatedUser) {
    if (admin.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin only');
    }

    return this.prisma.expertVerification.findMany({
      where: { status: VerificationStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, email: true, username: true } },
      },
    });
  }

  async review(id: string, admin: AuthenticatedUser, dto: ReviewExpertDto) {
    if (admin.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin only');
    }

    const verification = await this.prisma.expertVerification.findUnique({
      where: { id },
    });

    if (!verification) {
      throw new NotFoundException('Verification application not found');
    }

    if (verification.status !== VerificationStatus.PENDING) {
      throw new ConflictException('Application already reviewed');
    }

    const newStatus = dto.approved
      ? VerificationStatus.APPROVED
      : VerificationStatus.REJECTED;

    const writes = [
      this.prisma.expertVerification.update({
        where: { id },
        data: {
          status: newStatus,
          reviewNote: dto.note,
          reviewedAt: new Date(),
          reviewedBy: admin.id,
        },
      }),
      ...(dto.approved
        ? [
            this.prisma.user.update({
              where: { id: verification.userId },
              data: { role: UserRole.EXPERT },
            }),
          ]
        : []),
    ];

    const results = await this.prisma.$transaction(writes);
    return results[0];
  }
}
