import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { DebatesModule } from './debates/debates.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: getRedisConnection(config),
      }),
    }),
    PrismaModule,
    UsersModule,
    AuthModule,
    DebatesModule,
  ],
})
export class AppModule {}

function getRedisConnection(config: ConfigService) {
  const redisUrl = config.get<string>('REDIS_URL');

  if (redisUrl) {
    const url = new URL(redisUrl);
    const db = url.pathname.replace('/', '');

    return {
      host: url.hostname,
      port: Number(url.port || 6379),
      username: url.username || undefined,
      password: url.password || undefined,
      db: db ? Number(db) : undefined,
      tls: url.protocol === 'rediss:' ? {} : undefined,
    };
  }

  return {
    host: config.get<string>('REDIS_HOST') ?? 'localhost',
    port: Number(config.get<string>('REDIS_PORT') ?? 6379),
    password: config.get<string>('REDIS_PASSWORD') || undefined,
    db: Number(config.get<string>('REDIS_DB') ?? 0),
  };
}
