import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CreateResearchRequestDto } from './dto/create-research-request.dto';
import { ResolveResearchRequestDto } from './dto/resolve-research-request.dto';
import { ResearchService } from './research.service';

@ApiTags('Research')
@Controller('research')
export class ResearchController {
  constructor(private readonly researchService: ResearchService) {}

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a research request for a debate' })
  @ApiCreatedResponse({ description: 'Research request created' })
  @UseGuards(JwtAuthGuard)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateResearchRequestDto) {
    return this.researchService.create(user, dto);
  }

  @ApiOperation({ summary: 'List all open research requests' })
  @ApiOkResponse({ description: 'Research requests' })
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  findAll(@CurrentUser() user?: AuthenticatedUser) {
    return this.researchService.findAll(user);
  }

  @ApiOperation({ summary: 'List research requests for a debate' })
  @ApiParam({ name: 'debateId' })
  @UseGuards(OptionalJwtAuthGuard)
  @Get('debate/:debateId')
  findByDebate(
    @Param('debateId', new ParseUUIDPipe({ version: '4' })) debateId: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.researchService.findByDebate(debateId, user);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resolve a research request' })
  @ApiParam({ name: 'id' })
  @UseGuards(JwtAuthGuard)
  @Patch(':id/resolve')
  resolve(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ResolveResearchRequestDto,
  ) {
    return this.researchService.resolve(id, user, dto);
  }
}
