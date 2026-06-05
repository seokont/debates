import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class BillingWebhookDto {
  @ApiProperty({ example: '4b8a7f91-0a3b-4b68-ae30-f3b2b4f41d2c' })
  @IsUUID('4')
  userId: string;

  @ApiProperty({ example: 10, minimum: 1, maximum: 10000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  amount: number;

  @ApiPropertyOptional({ example: 'pi_123' })
  @IsOptional()
  @IsString()
  stripePaymentId?: string;
}
