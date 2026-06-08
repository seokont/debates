import { Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
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
import { OpportunityReportService } from './opportunity-report.service';

@ApiTags('Opportunity Reports')
@Controller('opportunity-reports')
export class OpportunityReportController {
  constructor(private readonly reportService: OpportunityReportService) {}

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate (or retrieve cached) Opportunity Report for a completed debate' })
  @ApiCreatedResponse({ description: 'Report generated' })
  @ApiParam({ name: 'debateId' })
  @UseGuards(JwtAuthGuard)
  @Post(':debateId')
  generate(
    @Param('debateId', new ParseUUIDPipe({ version: '4' })) debateId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reportService.generate(debateId, user.id);
  }

  @ApiOperation({ summary: 'Get cached Opportunity Report for a debate' })
  @ApiOkResponse({ description: 'Report' })
  @ApiParam({ name: 'debateId' })
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':debateId')
  findOne(@Param('debateId', new ParseUUIDPipe({ version: '4' })) debateId: string) {
    return this.reportService.findOne(debateId);
  }
}
