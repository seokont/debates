import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class AccessLicenseDto {
  @ApiProperty({ description: 'Intended purpose of use for this dataset' })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  purpose: string;
}
