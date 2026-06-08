import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CorpTier } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCorpKeyDto {
  @ApiProperty({ description: 'Human-readable name for this API key' })
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  name: string;

  @ApiPropertyOptional({ enum: CorpTier, default: CorpTier.STARTER })
  @IsOptional()
  @IsEnum(CorpTier)
  tier?: CorpTier = CorpTier.STARTER;
}
