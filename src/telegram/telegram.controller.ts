import { Body, Controller, Delete, Headers, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { TelegramConnectDto } from './dto/telegram-connect.dto';
import { TelegramService, TelegramWebhookUpdate } from './telegram.service';

@ApiTags('Telegram')
@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Connect Telegram notifications or create a bot /start connection token',
  })
  @ApiCreatedResponse({ description: 'Telegram connection state' })
  @UseGuards(JwtAuthGuard)
  @Post('connect')
  connect(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TelegramConnectDto,
  ) {
    return this.telegramService.connect(user, dto);
  }

  @ApiOperation({ summary: 'Telegram bot webhook' })
  @ApiOkResponse({ description: 'Webhook accepted' })
  @Post('webhook')
  webhook(
    @Body() update: TelegramWebhookUpdate,
    @Headers('x-telegram-bot-api-secret-token') webhookSecret?: string,
  ) {
    return this.telegramService.handleWebhook(update, webhookSecret);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disconnect Telegram notifications' })
  @ApiOkResponse({ description: 'Telegram disconnected' })
  @UseGuards(JwtAuthGuard)
  @Delete('disconnect')
  disconnect(@CurrentUser() user: AuthenticatedUser) {
    return this.telegramService.disconnect(user);
  }
}
