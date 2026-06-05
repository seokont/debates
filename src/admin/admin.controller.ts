import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminService } from './admin.service';
import { AdminDebatesQueryDto } from './dto/admin-debates-query.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @ApiOperation({ summary: 'List debates for admin review' })
  @ApiOkResponse({ description: 'Admin debate list' })
  @Get('debates')
  listDebates(@Query() query: AdminDebatesQueryDto) {
    return this.adminService.listDebates(query);
  }

  @ApiOperation({ summary: 'Get debate details, logs, and MVP cost snapshot' })
  @ApiParam({ name: 'id', description: 'Debate UUID' })
  @ApiOkResponse({ description: 'Admin debate detail' })
  @Get('debates/:id')
  getDebate(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.adminService.getDebate(id);
  }

  @ApiOperation({ summary: 'Retry a failed debate without charging credits' })
  @ApiParam({ name: 'id', description: 'Debate UUID' })
  @ApiOkResponse({ description: 'Retry job queued' })
  @Post('debates/:id/retry')
  retryDebate(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.adminService.retryDebate(id);
  }

  @ApiOperation({ summary: 'Accept a human injection as admin' })
  @ApiParam({ name: 'id', description: 'Injection UUID' })
  @ApiOkResponse({ description: 'Injection accepted' })
  @Post('injections/:id/accept')
  acceptInjection(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.adminService.acceptInjection(id);
  }

  @ApiOperation({ summary: 'Reject a pending human injection as admin' })
  @ApiParam({ name: 'id', description: 'Injection UUID' })
  @ApiOkResponse({ description: 'Injection rejected' })
  @Post('injections/:id/reject')
  rejectInjection(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.adminService.rejectInjection(id);
  }

  @ApiOperation({ summary: 'Inspect BullMQ queue counts and recent jobs' })
  @ApiOkResponse({ description: 'Queue job overview' })
  @Get('jobs')
  getJobs() {
    return this.adminService.getJobs();
  }
}
