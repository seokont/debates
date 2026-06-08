import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ResearchStatus, UserRole, Visibility } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CreateResearchRequestDto } from './dto/create-research-request.dto';
import { ResolveResearchRequestDto } from './dto/resolve-research-request.dto';

@Injectable()
export class ResearchService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthenticatedUser, dto: CreateResearchRequestDto) {
    const debate = await this.prisma.debate.findFirst({
      where: { id: dto.debateId, ...this.readableWhere(user) },
      select: { id: true },
    });

    if (!debate) {
      throw new NotFoundException('Debate not found');
    }

    return this.prisma.researchRequest.create({
      data: {
        debateId: dto.debateId,
        userId: user.id,
        question: dto.question.trim(),
        context: dto.context?.trim(),
      },
    });
  }

  findAll(user?: AuthenticatedUser) {
    return this.prisma.researchRequest.findMany({
      where: {
        debate: this.readableWhere(user),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        user: { select: { id: true, username: true, role: true } },
        debate: { select: { id: true, title: true, slug: true } },
      },
    });
  }

  async findByDebate(debateId: string, user?: AuthenticatedUser) {
    const debate = await this.prisma.debate.findFirst({
      where: { id: debateId, ...this.readableWhere(user) },
      select: { id: true },
    });

    if (!debate) {
      throw new NotFoundException('Debate not found');
    }

    return this.prisma.researchRequest.findMany({
      where: { debateId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, username: true, role: true } },
      },
    });
  }

  async resolve(
    id: string,
    user: AuthenticatedUser,
    dto: ResolveResearchRequestDto,
  ) {
    const request = await this.prisma.researchRequest.findUnique({ where: { id } });

    if (!request) {
      throw new NotFoundException('Research request not found');
    }

    if (user.role !== UserRole.ADMIN && request.userId !== user.id) {
      throw new ForbiddenException('Cannot resolve this research request');
    }

    return this.prisma.researchRequest.update({
      where: { id },
      data: {
        status: ResearchStatus.RESOLVED,
        resolvedAt: new Date(),
        ...(dto.note
          ? { context: [request.context, dto.note].filter(Boolean).join('\n\n---\n') }
          : {}),
      },
    });
  }

  private readableWhere(user?: AuthenticatedUser) {
    if (user?.role === UserRole.ADMIN) return {};
    if (user) return { OR: [{ visibility: Visibility.PUBLIC }, { userId: user.id }] };
    return { visibility: Visibility.PUBLIC };
  }
}
