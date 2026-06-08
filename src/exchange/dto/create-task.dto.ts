import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskLevel } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTaskDto {
  @ApiProperty()
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  title: string;

  @ApiProperty()
  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  description: string;

  @ApiProperty({ enum: TaskLevel })
  @IsEnum(TaskLevel)
  level: TaskLevel;

  @ApiPropertyOptional({ description: 'Reward in credits (for MICRO/MINI tasks)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  rewardCredits?: number;

  @ApiPropertyOptional({ description: 'Equity reward as percentage (for TASK/ROLE)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(20)
  rewardPercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  projectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  debateId?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 deadline' })
  @IsOptional()
  @IsDateString()
  deadline?: string;
}
