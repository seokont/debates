import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Sse,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CreateDebateDto } from './dto/create-debate.dto';
import { DebatesService } from './debates.service';

@ApiTags('Debates')
@Controller('debates')
export class DebatesController {
  constructor(private readonly debatesService: DebatesService) {}

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create debate, charge 1 credit, and enqueue worker job' })
  @ApiCreatedResponse({ description: 'Debate created and queued' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDebateDto,
  ) {
    return this.debatesService.create(user, dto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'List public debates and own private debates when authorized' })
  @ApiOkResponse({ description: 'Debate list' })
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  findAll(@CurrentUser() user?: AuthenticatedUser) {
    return this.debatesService.findAll(user);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get final debate result' })
  @ApiParam({ name: 'id', description: 'Debate UUID' })
  @ApiOkResponse({ description: 'Final debate result' })
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id/final')
  findFinal(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.debatesService.findFinal(id, user);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Stream debate events with Server-Sent Events' })
  @ApiParam({ name: 'id', description: 'Debate UUID' })
  @UseGuards(OptionalJwtAuthGuard)
  @Sse(':id/stream')
  stream(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.debatesService.stream(id, user);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get debate by id' })
  @ApiParam({ name: 'id', description: 'Debate UUID' })
  @ApiOkResponse({ description: 'Debate with rounds and events' })
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.debatesService.findOne(id, user);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Restart failed, completed, or cancelled debate' })
  @ApiParam({ name: 'id', description: 'Debate UUID' })
  @ApiOkResponse({ description: 'Debate restarted and queued' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @UseGuards(JwtAuthGuard)
  @Post(':id/restart')
  restart(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.debatesService.restart(id, user);
  }
}
