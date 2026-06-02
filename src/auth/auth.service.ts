import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PublicUser, UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateMeDto } from './dto/update-me.dto';

type JwtTokenType = 'access' | 'refresh';

type JwtPayload = {
  sub: string;
  email: string;
  role: UserRole;
  type: JwtTokenType;
  jti?: string;
};

type AuthResponse = {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
};

type JwtExpiresIn = NonNullable<JwtSignOptions['expiresIn']>;

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const email = dto.email.toLowerCase();
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.users.create({
      email,
      passwordHash,
      username: dto.username,
    });

    const tokens = await this.issueTokens(user);
    return { user, ...tokens };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.users.findByEmail(dto.email);
    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const publicUser = this.users.toPublicUser(user);
    const tokens = await this.issueTokens(publicUser);
    return { user: publicUser, ...tokens };
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    const payload = await this.verifyRefreshToken(refreshToken);
    if (!payload.jti) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { id: payload.jti },
      include: { user: true },
    });

    if (
      !storedToken ||
      storedToken.revokedAt ||
      storedToken.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenMatches = await bcrypt.compare(
      refreshToken,
      storedToken.tokenHash,
    );
    if (!tokenMatches) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    const publicUser = this.users.toPublicUser(storedToken.user);
    const tokens = await this.issueTokens(publicUser);
    return { user: publicUser, ...tokens };
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.users.toPublicUser(user);
  }

  updateMe(userId: string, dto: UpdateMeDto): Promise<PublicUser> {
    const data: { username?: string | null; avatarUrl?: string | null } = {};

    if (dto.username !== undefined) {
      data.username = dto.username;
    }

    if (dto.avatarUrl !== undefined) {
      data.avatarUrl = dto.avatarUrl;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No profile fields provided');
    }

    return this.users.updateProfile(userId, data);
  }

  async verifyAccessToken(token: string): Promise<JwtPayload> {
    const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
      secret: this.accessSecret,
    });

    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid access token');
    }

    return payload;
  }

  private async verifyRefreshToken(token: string): Promise<JwtPayload> {
    const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
      secret: this.refreshSecret,
    });

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return payload;
  }

  private async issueTokens(user: PublicUser) {
    const refreshTokenId = randomUUID();
    const accessToken = await this.jwt.signAsync(
      this.toPayload(user, 'access'),
      {
        secret: this.accessSecret,
        expiresIn: this.accessExpiresIn,
      },
    );

    const refreshToken = await this.jwt.signAsync(
      this.toPayload(user, 'refresh', refreshTokenId),
      {
        secret: this.refreshSecret,
        expiresIn: this.refreshExpiresIn,
      },
    );

    await this.prisma.refreshToken.create({
      data: {
        id: refreshTokenId,
        tokenHash: await bcrypt.hash(refreshToken, 12),
        userId: user.id,
        expiresAt: new Date(
          Date.now() +
            this.parseDuration(
              this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d',
            ),
        ),
      },
    });

    return { accessToken, refreshToken };
  }

  private toPayload(
    user: PublicUser,
    type: JwtTokenType,
    tokenId?: string,
  ): JwtPayload {
    return {
      sub: user.id,
      email: user.email,
      role: user.role,
      type,
      jti: tokenId,
    };
  }

  private parseDuration(value: string): number {
    const match = value.trim().match(/^(\d+)(ms|s|m|h|d)$/);
    if (!match) {
      throw new BadRequestException(
        'JWT_REFRESH_EXPIRES_IN must look like 7d, 24h, 60m, 3600s, or 1000ms',
      );
    }

    const amount = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      ms: 1,
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return amount * multipliers[unit];
  }

  private get accessSecret(): string {
    return this.getRequiredSecret('JWT_ACCESS_SECRET');
  }

  private get refreshSecret(): string {
    return this.getRequiredSecret('JWT_REFRESH_SECRET');
  }

  private get accessExpiresIn(): JwtExpiresIn {
    return (this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ??
      '15m') as JwtExpiresIn;
  }

  private get refreshExpiresIn(): JwtExpiresIn {
    return (this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ??
      '7d') as JwtExpiresIn;
  }

  private getRequiredSecret(name: string): string {
    const value = this.config.get<string>(name);
    if (!value) {
      throw new Error(`${name} is required`);
    }

    return value;
  }
}
