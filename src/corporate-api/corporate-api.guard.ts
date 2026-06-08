import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CorporateApiGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = this.extractApiKey(request);

    if (!apiKey) throw new UnauthorizedException('Corporate API key required');

    const keyHash = createHash('sha256').update(apiKey).digest('hex');

    const record = await this.prisma.corporateApiKey.findFirst({
      where: { keyHash, isActive: true },
    });

    if (!record) throw new UnauthorizedException('Invalid or inactive API key');

    const now = new Date();
    const lastReset = new Date(record.lastResetAt);
    const hoursSinceReset = (now.getTime() - lastReset.getTime()) / 3600000;

    if (hoursSinceReset >= 24) {
      await this.prisma.corporateApiKey.update({
        where: { id: record.id },
        data: { callsToday: 0, lastResetAt: now },
      });
      record.callsToday = 0;
    }

    if (record.callsToday >= record.rateLimit) {
      throw new UnauthorizedException(`Rate limit exceeded: ${record.rateLimit} calls/day`);
    }

    await this.prisma.corporateApiKey.update({
      where: { id: record.id },
      data: {
        callsToday: { increment: 1 },
        callsTotal: { increment: 1 },
      },
    });

    (request as any).corpApiKeyId = record.id;
    (request as any).corpUserId = record.userId;

    return true;
  }

  private extractApiKey(request: Request): string | undefined {
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('ApiKey ')) {
      return authHeader.slice(7);
    }
    return (request.headers['x-api-key'] as string) ?? undefined;
  }
}
