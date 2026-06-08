import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CompleteTaskDto {
  @ApiPropertyOptional({ description: 'Completion note or link to deliverable' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
