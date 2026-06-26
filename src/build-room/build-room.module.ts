import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BuildRoomController } from './build-room.controller';
import { BuildRoomProcessor } from './build-room.processor';
import { BUILD_QUEUE, BuildRoomService } from './build-room.service';
import { CascadeAgentService } from './services/cascade-agent.service';
import { DeployService } from './services/deploy.service';

@Module({
  imports: [
    AuthModule,
    ConfigModule,
    PrismaModule,
    BullModule.registerQueue({ name: BUILD_QUEUE }),
  ],
  controllers: [BuildRoomController],
  providers: [BuildRoomService, BuildRoomProcessor, CascadeAgentService, DeployService],
  exports: [BuildRoomService],
})
export class BuildRoomModule {}
