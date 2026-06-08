import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewExpertDto {
  @ApiProperty({ description: 'Approve or reject the application' })
  @IsBoolean()
  approved: boolean;

  @ApiPropertyOptional({ description: 'Review note for the applicant' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
