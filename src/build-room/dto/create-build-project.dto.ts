import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateBuildProjectDto {
  @ApiProperty({ description: 'Debate UUID with opportunityScore >= 80' })
  @IsUUID('4')
  debateId: string;
}
