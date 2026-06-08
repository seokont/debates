import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class FundBranchDto {
  @ApiProperty({ description: 'Debate/branch UUID to fund' })
  @IsUUID('4')
  debateId: string;

  @ApiProperty({ description: 'Amount of credits to fund', minimum: 10, maximum: 10000 })
  @Type(() => Number)
  @IsNumber()
  @Min(10)
  @Max(10000)
  amountCredits: number;

  @ApiPropertyOptional({ description: 'Requested royalty % from future revenue (0-25)', minimum: 0, maximum: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(25)
  royaltyPercent?: number = 5;
}
