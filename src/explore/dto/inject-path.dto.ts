import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class InjectPathDto {
  @ApiProperty({ description: 'Your hypothesis or path to inject into the exploration' })
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  hypothesis: string;
}
