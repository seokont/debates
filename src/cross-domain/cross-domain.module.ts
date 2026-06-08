import { Module } from '@nestjs/common';
import { DebateEngineModule } from '../debate-engine/debate-engine.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CrossDomainService } from './cross-domain.service';
import { ProfitPatternService } from './profit-pattern.service';

@Module({
  imports: [PrismaModule, DebateEngineModule],
  providers: [CrossDomainService, ProfitPatternService],
  exports: [CrossDomainService],
})
export class CrossDomainModule {}
