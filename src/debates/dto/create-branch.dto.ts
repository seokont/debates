import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class CreateBranchDto {
  @ApiProperty({
    description: 'Index of child question from parent debate finalization (0, 1, or 2)',
    minimum: 0,
    maximum: 2,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2)
  questionIndex: number;
}
