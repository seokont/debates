import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DataLicensingController } from './data-licensing.controller';
import { DataLicensingService } from './data-licensing.service';

@Module({
  imports: [AuthModule, PrismaModule, BillingModule],
  controllers: [DataLicensingController],
  providers: [DataLicensingService],
  exports: [DataLicensingService],
})
export class DataLicensingModule {}
