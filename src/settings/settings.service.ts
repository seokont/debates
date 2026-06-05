import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { AiProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CreateUserApiKeyDto } from './dto/create-user-api-key.dto';

@Injectable()
export class SettingsService {
  private readonly encryptionVersion = 'v1';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async listApiKeys(user: AuthenticatedUser) {
    const apiKeys = await this.prisma.userApiKey.findMany({
      where: {
        userId: user.id,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return apiKeys.map((apiKey) => ({
      id: apiKey.id,
      provider: apiKey.provider,
      maskedValue: this.maskKey(this.decrypt(apiKey.encryptedKey)),
      isActive: apiKey.isActive,
      createdAt: apiKey.createdAt,
    }));
  }

  async createApiKey(user: AuthenticatedUser, dto: CreateUserApiKeyDto) {
    const rawKey = dto.key.trim();
    const apiKey = await this.prisma.userApiKey.create({
      data: {
        userId: user.id,
        provider: dto.provider,
        encryptedKey: this.encrypt(rawKey),
      },
    });

    return {
      id: apiKey.id,
      provider: apiKey.provider,
      maskedValue: this.maskKey(rawKey),
      isActive: apiKey.isActive,
      createdAt: apiKey.createdAt,
    };
  }

  async deleteApiKey(user: AuthenticatedUser, id: string) {
    const updated = await this.prisma.userApiKey.updateMany({
      where: {
        id,
        userId: user.id,
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });

    if (updated.count !== 1) {
      throw new NotFoundException('API key not found');
    }

    return { deleted: true };
  }

  async getActiveApiKey(
    userId: string,
    provider: AiProvider,
  ): Promise<string | null> {
    const apiKey = await this.prisma.userApiKey.findFirst({
      where: {
        userId,
        provider,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!apiKey) {
      return null;
    }

    const decrypted = this.decrypt(apiKey.encryptedKey);

    return decrypted || null;
  }

  private encrypt(rawKey: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.getEncryptionKey(), iv);
    const ciphertext = Buffer.concat([
      cipher.update(rawKey, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
      this.encryptionVersion,
      iv.toString('base64url'),
      authTag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join(':');
  }

  private decrypt(encryptedKey: string): string {
    const [version, iv, authTag, ciphertext] = encryptedKey.split(':');

    if (version !== this.encryptionVersion || !iv || !authTag || !ciphertext) {
      return '';
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.getEncryptionKey(),
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(authTag, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  private maskKey(rawKey: string): string {
    if (!rawKey) {
      return '****';
    }

    const prefix = rawKey.slice(0, Math.min(8, rawKey.length));
    const suffix = rawKey.slice(-3);

    return `${prefix}****${suffix}`;
  }

  private getEncryptionKey(): Buffer {
    const secret =
      this.config.get<string>('USER_API_KEY_ENCRYPTION_SECRET') ||
      this.config.get<string>('JWT_ACCESS_SECRET') ||
      'development-user-api-key-secret';

    return createHash('sha256').update(secret).digest();
  }
}
