import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateResearchRequestDto {
  @ApiProperty({ description: 'Debate this research request belongs to' })
  @IsUUID('4')
  debateId: string;

  @ApiProperty({ description: 'The research question that needs answering' })
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  question: string;

  @ApiPropertyOptional({ description: 'Additional context or background' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  context?: string;
}
