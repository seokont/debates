import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ExploreModule } from '../explore/explore.module';
import { PrismaModule } from '../prisma/prisma.module';
import { McpServerController } from './mcp-server.controller';
import { McpServerService } from './mcp-server.service';

@Module({
  imports: [AuthModule, PrismaModule, ExploreModule],
  controllers: [McpServerController],
  providers: [McpServerService],
  exports: [McpServerService],
})
export class McpServerModule {}
