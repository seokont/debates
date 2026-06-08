import {
  Body,
  Controller,
  Delete,
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
import { CorporateApiService } from './corporate-api.service';
import { CreateCorpKeyDto } from './dto/create-corp-key.dto';

@ApiTags('Corporate API')
@Controller('corporate-api')
export class CorporateApiController {
  constructor(private readonly corporateApiService: CorporateApiService) {}

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new corporate API key' })
  @ApiCreatedResponse({ description: 'API key created — store the key, it is shown only once' })
  @UseGuards(JwtAuthGuard)
  @Post('keys')
  createKey(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCorpKeyDto) {
    return this.corporateApiService.createKey(user, dto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'List my corporate API keys' })
  @ApiOkResponse({ description: 'API keys (without secrets)' })
  @UseGuards(JwtAuthGuard)
  @Get('keys')
  listKeys(@CurrentUser() user: AuthenticatedUser) {
    return this.corporateApiService.listKeys(user.id);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a corporate API key' })
  @ApiParam({ name: 'id' })
  @UseGuards(JwtAuthGuard)
  @Delete('keys/:id')
  revokeKey(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.corporateApiService.revokeKey(id, user.id);
  }
}
