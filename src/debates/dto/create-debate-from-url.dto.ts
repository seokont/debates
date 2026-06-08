import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DebateAiModel, DebateMode, Visibility } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsUrl,
  Max,
  Min,
} from 'class-validator';

export class CreateDebateFromUrlDto {
  @ApiProperty({ example: 'https://arxiv.org/abs/2401.00001' })
  @IsUrl()
  url: string;

  @ApiPropertyOptional({ enum: DebateMode })
  @IsOptional()
  @IsEnum(DebateMode)
  mode?: DebateMode;

  @ApiPropertyOptional({ enum: Visibility })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

  @ApiPropertyOptional({ type: [String], enum: DebateAiModel })
  @IsOptional()
  @IsArray()
  @IsEnum(DebateAiModel, { each: true })
  models?: DebateAiModel[];

  @ApiPropertyOptional({ minimum: 3, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(3)
  @Max(20)
  maxRounds?: number;
}
