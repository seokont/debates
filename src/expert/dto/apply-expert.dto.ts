import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ApplyExpertDto {
  @ApiProperty({ example: 'longevity', description: 'Domain of expertise' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  domain: string;

  @ApiProperty({ description: 'Evidence: CV link, publication list, or description' })
  @IsString()
  @MinLength(20)
  @MaxLength(3000)
  evidence: string;
}
