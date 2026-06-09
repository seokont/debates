import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CreateModelEndpointDto } from './dto/create-model-endpoint.dto';

@Injectable()
export class EnterpriseService {
  private readonly encKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const secret = this.config.get<string>('ENCRYPTION_SECRET') ?? 'mind-arena-enterprise-fallback';
    this.encKey = scryptSync(secret, 'mind-arena-salt', 32) as Buffer;
  }

  async addEndpoint(user: AuthenticatedUser, dto: CreateModelEndpointDto) {
    const encryptedKey = this.encrypt(dto.apiKey);

    return this.prisma.customModelEndpoint.create({
      data: {
        userId: user.id,
        name: dto.name,
        baseUrl: dto.baseUrl,
        encryptedKey,
        modelId: dto.modelId,
        provider: dto.provider,
      },
      select: {
        id: true,
        name: true,
        baseUrl: true,
        modelId: true,
        provider: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  listEndpoints(userId: string) {
    return this.prisma.customModelEndpoint.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        baseUrl: true,
        modelId: true,
        provider: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  async deactivateEndpoint(id: string, userId: string) {
    const endpoint = await this.prisma.customModelEndpoint.findFirst({ where: { id, userId } });
    if (!endpoint) throw new NotFoundException('Endpoint not found');

    await this.prisma.customModelEndpoint.update({
      where: { id },
      data: { isActive: false },
    });

    return { deactivated: true };
  }

  async getUserActiveEndpoint(
    userId: string,
  ): Promise<{ baseUrl: string; apiKey: string; modelId: string } | null> {
    const endpoint = await this.prisma.customModelEndpoint.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
      select: { baseUrl: true, encryptedKey: true, modelId: true },
    });

    if (!endpoint) return null;

    return {
      baseUrl: endpoint.baseUrl,
      apiKey: this.decrypt(endpoint.encryptedKey),
      modelId: endpoint.modelId,
    };
  }

  async testEndpoint(
    userId: string,
    id: string,
  ): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const endpoint = await this.prisma.customModelEndpoint.findFirst({
      where: { id, userId, isActive: true },
      select: { baseUrl: true, encryptedKey: true, modelId: true },
    });

    if (!endpoint) throw new NotFoundException('Endpoint not found or inactive');

    const apiKey = this.decrypt(endpoint.encryptedKey);
    const start = Date.now();

    try {
      const response = await fetch(`${endpoint.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: endpoint.modelId,
          messages: [{ role: 'user', content: 'Say "ok"' }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(10000),
      });

      return { ok: response.ok, latencyMs: Date.now() - start };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  encrypt(text: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', this.encKey, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  decrypt(encoded: string): string {
    const [ivHex, tagHex, dataHex] = encoded.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', this.encKey, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data).toString('utf8') + decipher.final('utf8');
  }
}
