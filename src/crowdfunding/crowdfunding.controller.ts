import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
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
import { CrowdfundingService } from './crowdfunding.service';
import { FundBranchDto } from './dto/fund-branch.dto';

@ApiTags('Crowdfunding')
@Controller('crowdfunding')
export class CrowdfundingController {
  constructor(private readonly crowdfundingService: CrowdfundingService) {}

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Fund a debate branch with credits and receive royalty share' })
  @ApiCreatedResponse({ description: 'Branch funded' })
  @UseGuards(JwtAuthGuard)
  @Post('fund')
  fund(@CurrentUser() user: AuthenticatedUser, @Body() dto: FundBranchDto) {
    return this.crowdfundingService.fund(user, dto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Withdraw (return) a branch fund before debate completes' })
  @ApiParam({ name: 'id' })
  @UseGuards(JwtAuthGuard)
  @Delete('fund/:id')
  withdraw(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.crowdfundingService.withdraw(id, user);
  }

  @ApiOperation({ summary: 'List funders for a debate branch' })
  @ApiParam({ name: 'debateId' })
  @ApiOkResponse({ description: 'Branch funders' })
  @Get('debate/:debateId')
  listForDebate(@Param('debateId', new ParseUUIDPipe({ version: '4' })) debateId: string) {
    return this.crowdfundingService.listForDebate(debateId);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'List my funded branches' })
  @ApiOkResponse({ description: 'My funded branches' })
  @UseGuards(JwtAuthGuard)
  @Get('my')
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.crowdfundingService.listForUser(user.id);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initialize default equity distribution for a build project (20/15/30/25/10)' })
  @ApiParam({ name: 'projectId' })
  @ApiCreatedResponse({ description: 'Equity shares created' })
  @UseGuards(JwtAuthGuard)
  @Post('equity/:projectId')
  setEquity(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.crowdfundingService.setEquityForProject(projectId, user.id);
  }

  @ApiOperation({ summary: 'Get equity distribution for a build project' })
  @ApiParam({ name: 'projectId' })
  @ApiOkResponse({ description: 'Equity shares' })
  @Get('equity/:projectId')
  getEquity(@Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string) {
    return this.crowdfundingService.getEquity(projectId);
  }
}
