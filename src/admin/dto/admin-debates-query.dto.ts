import { ApiPropertyOptional } from '@nestjs/swagger';
import { DebateStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class AdminDebatesQueryDto {
  @ApiPropertyOptional({
    enum: DebateStatus,
    example: DebateStatus.FAILED,
  })
  @IsOptional()
  @IsEnum(DebateStatus)
  status?: DebateStatus;

  @ApiPropertyOptional({
    example: '4b8a7f91-0a3b-4b68-ae30-f3b2b4f41d2c',
  })
  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @ApiPropertyOptional({ example: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number = 50;
}
