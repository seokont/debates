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
import { CreateUserApiKeyDto } from './dto/create-user-api-key.dto';
import { SettingsService } from './settings.service';

@ApiTags('Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @ApiOperation({ summary: 'List masked user AI API keys' })
  @ApiOkResponse({ description: 'Masked API keys' })
  @Get('api-keys')
  listApiKeys(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.listApiKeys(user);
  }

  @ApiOperation({ summary: 'Store an encrypted user AI API key' })
  @ApiCreatedResponse({ description: 'API key stored with masked value only' })
  @Post('api-keys')
  createApiKey(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateUserApiKeyDto,
  ) {
    return this.settingsService.createApiKey(user, dto);
  }

  @ApiOperation({ summary: 'Deactivate a stored user AI API key' })
  @ApiParam({ name: 'id', description: 'API key UUID' })
  @ApiOkResponse({ description: 'API key deleted' })
  @Delete('api-keys/:id')
  deleteApiKey(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.settingsService.deleteApiKey(user, id);
  }
}
