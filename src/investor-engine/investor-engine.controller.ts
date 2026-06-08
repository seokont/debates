import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
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
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { FindInvestorsDto } from './dto/find-investors.dto';
import { InvestorEngineService } from './investor-engine.service';

@ApiTags('Investor Engine')
@Controller('investor-engine')
export class InvestorEngineController {
  constructor(private readonly investorEngineService: InvestorEngineService) {}

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Find and match investors for a build project' })
  @ApiCreatedResponse({ description: 'Investor matches created' })
  @UseGuards(JwtAuthGuard)
  @Post('find')
  findInvestors(@CurrentUser() user: AuthenticatedUser, @Body() dto: FindInvestorsDto) {
    return this.investorEngineService.findInvestors(dto.projectId, user.id);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'List investor matches for a project' })
  @ApiParam({ name: 'projectId' })
  @ApiOkResponse({ description: 'Investor matches' })
  @UseGuards(JwtAuthGuard)
  @Get(':projectId/matches')
  listMatches(@Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string) {
    return this.investorEngineService.listMatches(projectId);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send outreach email for a specific investor match' })
  @ApiParam({ name: 'matchId' })
  @UseGuards(JwtAuthGuard)
  @Post('matches/:matchId/send')
  sendOutreach(
    @Param('matchId', new ParseUUIDPipe({ version: '4' })) matchId: string,
    @Headers('x-base-url') baseUrl: string,
  ) {
    return this.investorEngineService.sendOutreach(
      matchId,
      baseUrl ?? 'https://mindarena.app',
    );
  }
}
