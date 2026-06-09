import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LicenseType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateLicenseDto {
  @ApiProperty({ description: 'Debate UUID to license' })
  @IsUUID('4')
  debateId: string;

  @ApiProperty({ description: 'License title' })
  @IsString()
  @MinLength(5)
  @MaxLength(128)
  title: string;

  @ApiProperty({ description: 'What this dataset contains and its research value' })
  @IsString()
  @MinLength(20)
  @MaxLength(1000)
  description: string;

  @ApiPropertyOptional({ enum: LicenseType, default: LicenseType.CC_BY })
  @IsOptional()
  @IsEnum(LicenseType)
  licenseType?: LicenseType = LicenseType.CC_BY;

  @ApiPropertyOptional({ description: 'Credits required per access (0 = free)', minimum: 0, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(500)
  priceCredits?: number = 0;
}
