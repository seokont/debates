import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExploreType, SessionMode } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateExploreDto {
  @ApiProperty({ description: 'Question or domain to explore', minLength: 3, maxLength: 500 })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  question: string;

  @ApiPropertyOptional({ enum: SessionMode, default: SessionMode.EXPLORE })
  @IsOptional()
  @IsEnum(SessionMode)
  mode?: SessionMode = SessionMode.EXPLORE;

  @ApiPropertyOptional({ enum: ExploreType })
  @IsOptional()
  @IsEnum(ExploreType)
  exploreType?: ExploreType;

  @ApiPropertyOptional({ description: 'Budget limit in USD', minimum: 1, maximum: 50, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  budgetLimit?: number = 10;
}
