import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { BuildRoomService } from './build-room.service';
import { CreateBuildProjectDto } from './dto/create-build-project.dto';

@ApiTags('Build Room')
@Controller('build-room')
export class BuildRoomController {
  constructor(private readonly buildRoomService: BuildRoomService) {}

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Launch Build Room from a completed debate (score >= 80)' })
  @ApiCreatedResponse({ description: 'Build project created and queued' })
  @UseGuards(JwtAuthGuard)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBuildProjectDto) {
    return this.buildRoomService.create(user, dto);
  }

  @ApiOperation({ summary: 'List all build projects' })
  @ApiOkResponse({ description: 'Build projects' })
  @Get()
  findAll() {
    return this.buildRoomService.findAll();
  }

  @ApiOperation({ summary: 'Get build project with events and tasks' })
  @ApiParam({ name: 'id' })
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.buildRoomService.findOne(id);
  }
}
