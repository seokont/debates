import {
  Body,
  Controller,
  Get,
  MessageEvent,
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
} from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CreateExploreDto } from './dto/create-explore.dto';
import { InjectPathDto } from './dto/inject-path.dto';
import { ExploreEventsService } from './explore-events.service';
import { ExploreService } from './explore.service';

@ApiTags('Explore & Quantum')
@Controller('explore')
export class ExploreController {
  constructor(
    private readonly exploreService: ExploreService,
    private readonly exploreEvents: ExploreEventsService,
  ) {}

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Start an Explore or Quantum session for an open question' })
  @ApiCreatedResponse({ description: 'Session created and queued' })
  @UseGuards(JwtAuthGuard)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateExploreDto) {
    return this.exploreService.create(user, dto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'List my explore sessions' })
  @ApiOkResponse({ description: 'Sessions' })
  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.exploreService.findAll(user.id);
  }

  @ApiOperation({ summary: 'Get explore session with paths and insights' })
  @ApiParam({ name: 'id' })
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.exploreService.findOne(id, user?.id);
  }

  @ApiOperation({ summary: 'Stream live explore session events via SSE' })
  @ApiParam({ name: 'id' })
  @Sse(':id/stream')
  stream(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Observable<MessageEvent> {
    return this.exploreEvents.stream(id);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Inject a human hypothesis into a running session' })
  @ApiParam({ name: 'id' })
  @UseGuards(JwtAuthGuard)
  @Post(':id/inject')
  injectPath(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: InjectPathDto,
  ) {
    return this.exploreService.injectPath(id, user, dto);
  }
}
