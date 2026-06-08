import { Body, Controller, Delete, Post, UseGuards } from '@nestjs/common';
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
import { WhatsAppConnectDto } from './dto/whatsapp-connect.dto';
import { WhatsAppService } from './whatsapp.service';

@ApiTags('WhatsApp')
@Controller('whatsapp')
export class WhatsAppController {
  constructor(private readonly whatsAppService: WhatsAppService) {}

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Connect WhatsApp phone number for notifications' })
  @ApiCreatedResponse({ description: 'WhatsApp connected' })
  @UseGuards(JwtAuthGuard)
  @Post('connect')
  connect(@CurrentUser() user: AuthenticatedUser, @Body() dto: WhatsAppConnectDto) {
    return this.whatsAppService.connect(user, dto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disconnect WhatsApp notifications' })
  @ApiOkResponse({ description: 'WhatsApp disconnected' })
  @UseGuards(JwtAuthGuard)
  @Delete('disconnect')
  disconnect(@CurrentUser() user: AuthenticatedUser) {
    return this.whatsAppService.disconnect(user);
  }
}
