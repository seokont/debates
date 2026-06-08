import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUrl } from 'class-validator';

export enum CreditPackage {
  STARTER = 'STARTER',   // $5 → 25 credits
  PRO = 'PRO',           // $15 → 80 credits
  ADVANCED = 'ADVANCED', // $40 → 220 credits
}

export const CREDIT_PACKAGES: Record<CreditPackage, { amountCents: number; credits: number; label: string }> = {
  [CreditPackage.STARTER]: { amountCents: 500, credits: 25, label: '25 credits' },
  [CreditPackage.PRO]: { amountCents: 1500, credits: 80, label: '80 credits' },
  [CreditPackage.ADVANCED]: { amountCents: 4000, credits: 220, label: '220 credits' },
};

export class CreateStripeSessionDto {
  @ApiProperty({ enum: CreditPackage, example: CreditPackage.STARTER })
  @IsEnum(CreditPackage)
  package: CreditPackage;

  @ApiProperty({ description: 'URL to redirect after successful payment' })
  @IsUrl({ require_tld: false })
  successUrl: string;

  @ApiProperty({ description: 'URL to redirect after cancelled payment' })
  @IsUrl({ require_tld: false })
  cancelUrl: string;
}
