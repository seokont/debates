import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DebateEngineModule } from '../debate-engine/debate-engine.module';
import { PrismaModule } from '../prisma/prisma.module';
import { OpportunityReportController } from './opportunity-report.controller';
import { OpportunityReportService } from './opportunity-report.service';

@Module({
  imports: [AuthModule, PrismaModule, DebateEngineModule],
  controllers: [OpportunityReportController],
  providers: [OpportunityReportService],
  exports: [OpportunityReportService],
})
export class OpportunityReportModule {}
