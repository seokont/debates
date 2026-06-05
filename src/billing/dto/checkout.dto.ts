import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CheckoutDto {
  @ApiProperty({ example: 10, minimum: 1, maximum: 10000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  amount: number;

  @ApiPropertyOptional({
    example: 'pi_123',
    description: 'Optional external payment id for MVP/testing.',
  })
  @IsOptional()
  @IsString()
  stripePaymentId?: string;
}
