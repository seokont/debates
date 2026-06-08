import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CorpTier } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCorpKeyDto } from './dto/create-corp-key.dto';

const RATE_LIMITS: Record<CorpTier, number> = {
  STARTER: 100,
  GROWTH: 1000,
  ENTERPRISE: 10000,
};

@Injectable()
export class CorporateApiService {
  constructor(private readonly prisma: PrismaService) {}

  async createKey(user: AuthenticatedUser, dto: CreateCorpKeyDto) {
    const existing = await this.prisma.corporateApiKey.count({
      where: { userId: user.id, isActive: true },
    });

    if (existing >= 5) {
      throw new ConflictException('Maximum 5 active API keys per account');
    }

    const rawKey = `ma_${randomBytes(32).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 10);
    const tier = dto.tier ?? CorpTier.STARTER;

    await this.prisma.corporateApiKey.create({
      data: {
        userId: user.id,
        name: dto.name,
        keyHash,
        keyPrefix,
        tier,
        rateLimit: RATE_LIMITS[tier],
      },
    });

    return { key: rawKey, prefix: keyPrefix, tier, rateLimit: RATE_LIMITS[tier] };
  }

  listKeys(userId: string) {
    return this.prisma.corporateApiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        tier: true,
        rateLimit: true,
        callsToday: true,
        callsTotal: true,
        isActive: true,
        createdAt: true,
        lastResetAt: true,
      },
    });
  }

  async revokeKey(id: string, userId: string) {
    const key = await this.prisma.corporateApiKey.findFirst({ where: { id, userId } });
    if (!key) throw new NotFoundException('API key not found');

    await this.prisma.corporateApiKey.update({
      where: { id },
      data: { isActive: false },
    });

    return { revoked: true };
  }
}
