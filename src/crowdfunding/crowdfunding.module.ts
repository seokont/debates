import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CrowdfundingController } from './crowdfunding.controller';
import { CrowdfundingService } from './crowdfunding.service';

@Module({
  imports: [AuthModule, PrismaModule, BillingModule],
  controllers: [CrowdfundingController],
  providers: [CrowdfundingService],
  exports: [CrowdfundingService],
})
export class CrowdfundingModule {}
