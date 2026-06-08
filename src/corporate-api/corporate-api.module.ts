import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CorporateApiController } from './corporate-api.controller';
import { CorporateApiGuard } from './corporate-api.guard';
import { CorporateApiService } from './corporate-api.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [CorporateApiController],
  providers: [CorporateApiService, CorporateApiGuard],
  exports: [CorporateApiService, CorporateApiGuard],
})
export class CorporateApiModule {}
