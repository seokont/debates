import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { DebateEngineModule } from '../debate-engine/debate-engine.module';
import { PrismaModule } from '../prisma/prisma.module';
import { InvestorEngineController } from './investor-engine.controller';
import { InvestorEngineService } from './investor-engine.service';
import { OutreachService } from './outreach.service';

@Module({
  imports: [AuthModule, ConfigModule, PrismaModule, DebateEngineModule],
  controllers: [InvestorEngineController],
  providers: [InvestorEngineService, OutreachService],
  exports: [InvestorEngineService],
})
export class InvestorEngineModule {}
