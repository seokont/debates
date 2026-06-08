import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { BuildRoomModule } from './build-room/build-room.module';
import { CrossDomainModule } from './cross-domain/cross-domain.module';
import { DebatesModule } from './debates/debates.module';
import { ExchangeModule } from './exchange/exchange.module';
import { ExpertModule } from './expert/expert.module';
import { ExploreModule } from './explore/explore.module';
import { InvestorEngineModule } from './investor-engine/investor-engine.module';
import { LearningLoopModule } from './learning-loop/learning-loop.module';
import { NewsMonitorModule } from './news-monitor/news-monitor.module';
import { PrismaModule } from './prisma/prisma.module';
import { ResearchModule } from './research/research.module';
import { SearchModule } from './search/search.module';
import { SettingsModule } from './settings/settings.module';
import { TelegramModule } from './telegram/telegram.module';
import { UsersModule } from './users/users.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    EventEmitterModule.forRoot(),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: getRedisConnection(config),
      }),
    }),
    PrismaModule,
    UsersModule,
    AuthModule,
    AdminModule,
    BillingModule,
    DebatesModule,
    SearchModule,
    SettingsModule,
    TelegramModule,
    ResearchModule,
    ExpertModule,
    WhatsAppModule,
    NewsMonitorModule,
    BuildRoomModule,
    ExchangeModule,
    ExploreModule,
    CrossDomainModule,
    InvestorEngineModule,
    LearningLoopModule,
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
