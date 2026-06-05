import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { BillingService } from './billing.service';
import { BillingWebhookDto } from './dto/billing-webhook.dto';
import { CheckoutDto } from './dto/checkout.dto';

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current credit balance' })
  @ApiOkResponse({ description: 'Credit balance' })
  @UseGuards(JwtAuthGuard)
  @Get('balance')
  getBalance(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getBalance(user);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'List credit transactions' })
  @ApiOkResponse({ description: 'Credit transactions' })
  @UseGuards(JwtAuthGuard)
  @Get('transactions')
  listTransactions(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.listTransactions(user);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'MVP checkout: add credits immediately' })
  @ApiOkResponse({ description: 'Updated balance' })
  @UseGuards(JwtAuthGuard)
  @Post('checkout')
  checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CheckoutDto,
  ) {
    return this.billingService.checkout(user, dto);
  }

  @ApiOperation({ summary: 'MVP billing webhook: credit user balance' })
  @ApiOkResponse({ description: 'Updated balance' })
  @Post('webhook')
  webhook(@Body() dto: BillingWebhookDto) {
    return this.billingService.webhook(dto);
  }
}
