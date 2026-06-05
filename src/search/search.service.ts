import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, UserRole, Visibility } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(rawQuery: string, user?: AuthenticatedUser) {
    const query = rawQuery.trim();

    if (!query) {
      throw new BadRequestException('Search query is required');
    }

    return this.prisma.debate.findMany({
      where: {
        AND: [this.readableWhere(user), this.searchWhere(query)],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        slug: true,
        originalThesis: true,
        currentThesis: true,
        finalSummary: true,
        finalThesis: true,
        status: true,
        visibility: true,
        tier: true,
        roundCount: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  private searchWhere(query: string): Prisma.DebateWhereInput {
    const filter: Prisma.StringFilter<'Debate'> = {
      contains: query,
      mode: 'insensitive',
    };

    return {
      OR: [
        { title: filter },
        { originalThesis: filter },
        { currentThesis: filter },
        { finalSummary: filter },
      ],
    };
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
}
