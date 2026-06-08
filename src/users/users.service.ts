import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type PublicUser = Omit<User, 'passwordHash'>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.UserCreateInput): Promise<PublicUser> {
    try {
      const user = await this.prisma.user.create({ data });
      return this.toPublicUser(user);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email is already registered');
      }

      throw error;
    }
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async updateProfile(
    id: string,
    data: Pick<Prisma.UserUpdateInput, 'username' | 'avatarUrl'>,
  ): Promise<PublicUser> {
    const user = await this.prisma.user.update({
      where: { id },
      data,
    });

    return this.toPublicUser(user);
  }

  async findOrCreateByGoogle(profile: {
    googleId: string;
    email: string;
    username?: string;
    avatarUrl?: string;
  }): Promise<PublicUser> {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          { googleId: profile.googleId },
          { email: profile.email.toLowerCase() },
        ],
      },
    });

    if (existing) {
      const needsUpdate =
        !existing.googleId ||
        (profile.avatarUrl && existing.avatarUrl !== profile.avatarUrl);

      if (needsUpdate) {
        const updated = await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            googleId: existing.googleId ?? profile.googleId,
            ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
          },
        });
        return this.toPublicUser(updated);
      }

      return this.toPublicUser(existing);
    }

    const user = await this.prisma.user.create({
      data: {
        email: profile.email.toLowerCase(),
        googleId: profile.googleId,
        username: profile.username,
        avatarUrl: profile.avatarUrl,
      },
    });

    return this.toPublicUser(user);
  }

  toPublicUser(user: User): PublicUser {
    const { passwordHash: _passwordHash, ...publicUser } = user;
    return publicUser;
  }
}
