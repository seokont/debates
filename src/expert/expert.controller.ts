import {
  Body,
  Controller,
  Get,
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
import { ApplyExpertDto } from './dto/apply-expert.dto';
import { ReviewExpertDto } from './dto/review-expert.dto';
import { ExpertService } from './expert.service';

@ApiTags('Expert Verification')
@Controller('expert')
export class ExpertController {
  constructor(private readonly expertService: ExpertService) {}

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Apply for expert verification' })
  @ApiCreatedResponse({ description: 'Application submitted' })
  @UseGuards(JwtAuthGuard)
  @Post('apply')
  apply(@CurrentUser() user: AuthenticatedUser, @Body() dto: ApplyExpertDto) {
    return this.expertService.apply(user, dto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my verification applications' })
  @ApiOkResponse({ description: 'My applications' })
  @UseGuards(JwtAuthGuard)
  @Get('my')
  myApplications(@CurrentUser() user: AuthenticatedUser) {
    return this.expertService.myApplications(user);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] List pending expert applications' })
  @ApiOkResponse({ description: 'Pending applications' })
  @UseGuards(JwtAuthGuard)
  @Get('pending')
  listPending(@CurrentUser() admin: AuthenticatedUser) {
    return this.expertService.listPending(admin);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Approve or reject expert application' })
  @ApiParam({ name: 'id' })
  @UseGuards(JwtAuthGuard)
  @Post(':id/review')
  review(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: ReviewExpertDto,
  ) {
    return this.expertService.review(id, admin, dto);
  }
}
