import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolveResearchRequestDto {
  @ApiPropertyOptional({ description: 'Resolution note or finding' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  note?: string;
}
