import { Module } from '@nestjs/common';
import { BuildRoomModule } from '../build-room/build-room.module';
import { ExploreModule } from '../explore/explore.module';
import { InvestorEngineModule } from '../investor-engine/investor-engine.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AvoPipelineService } from './avo-pipeline.service';

@Module({
  imports: [PrismaModule, ExploreModule, BuildRoomModule, InvestorEngineModule],
  providers: [AvoPipelineService],
})
export class AvoPipelineModule {}
