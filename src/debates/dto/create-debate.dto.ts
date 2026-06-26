import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { DebateAiModel, DebateMode, Visibility } from '@prisma/client';

export class CreateDebateDto {
  @ApiProperty({
    example: 'AI заменит middle management',
    minLength: 3,
    maxLength: 500,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  thesis: string;

  @ApiPropertyOptional({
    enum: DebateMode,
    default: DebateMode.CONVERGENT,
    example: DebateMode.CONVERGENT,
  })
  @IsOptional()
  @IsEnum(DebateMode)
  mode?: DebateMode = DebateMode.CONVERGENT;

  @ApiPropertyOptional({
    enum: Visibility,
    default: Visibility.PUBLIC,
    example: Visibility.PUBLIC,
  })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility = Visibility.PUBLIC;

  @ApiProperty({
    enum: DebateAiModel,
    isArray: true,
    example: [
      DebateAiModel.GPT,
      DebateAiModel.CLAUDE,
      DebateAiModel.GEMINI,
      DebateAiModel.GROK,
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ArrayUnique()
  @IsEnum(DebateAiModel, { each: true })
  models: DebateAiModel[];

  @ApiPropertyOptional({ example: 6, default: 6, minimum: 1, maximum: 6 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(6)
  maxRounds?: number = 6;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  quietMode?: boolean = false;

  @ApiPropertyOptional({ description: 'Source URL the thesis was extracted from' })
  @IsOptional()
  @IsUrl()
  sourceUrl?: string;
}
