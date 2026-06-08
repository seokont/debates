import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ExpertController } from './expert.controller';
import { ExpertService } from './expert.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ExpertController],
  providers: [ExpertService],
})
export class ExpertModule {}
