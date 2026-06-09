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
import { CreateModelEndpointDto } from './dto/create-model-endpoint.dto';
import { EnterpriseService } from './enterprise.service';

@ApiTags('Enterprise')
@Controller('enterprise')
export class EnterpriseController {
  constructor(private readonly enterpriseService: EnterpriseService) {}

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register a self-hosted model endpoint for Build Room (API key encrypted at rest)' })
  @ApiCreatedResponse({ description: 'Endpoint added' })
  @UseGuards(JwtAuthGuard)
  @Post('models')
  addEndpoint(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateModelEndpointDto) {
    return this.enterpriseService.addEndpoint(user, dto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'List my custom model endpoints (without API keys)' })
  @ApiOkResponse({ description: 'Endpoints' })
  @UseGuards(JwtAuthGuard)
  @Get('models')
  listEndpoints(@CurrentUser() user: AuthenticatedUser) {
    return this.enterpriseService.listEndpoints(user.id);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Test connectivity and latency to a custom endpoint' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Test result with latency' })
  @UseGuards(JwtAuthGuard)
  @Post('models/:id/test')
  testEndpoint(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.enterpriseService.testEndpoint(user.id, id);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deactivate a custom model endpoint' })
  @ApiParam({ name: 'id' })
  @UseGuards(JwtAuthGuard)
  @Delete('models/:id')
  deactivate(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.enterpriseService.deactivateEndpoint(id, user.id);
  }
}
