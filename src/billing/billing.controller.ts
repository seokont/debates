import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { BillingService } from './billing.service';
import { BillingWebhookDto } from './dto/billing-webhook.dto';
import { CheckoutDto } from './dto/checkout.dto';
import { CreateStripeSessionDto } from './dto/create-stripe-session.dto';

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

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create Stripe Checkout session for credit purchase' })
  @ApiCreatedResponse({ description: 'Stripe checkout session URL' })
  @UseGuards(JwtAuthGuard)
  @Post('stripe/checkout')
  stripeCheckout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateStripeSessionDto,
  ) {
    return this.billingService.createStripeSession(user, dto);
  }

  @ApiOperation({ summary: 'Stripe webhook — do not call manually' })
  @ApiOkResponse({ description: 'Webhook received' })
  @Post('stripe/webhook')
  stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    return this.billingService.handleStripeWebhook(
      req.rawBody ?? Buffer.alloc(0),
      signature,
    );
  }
}
