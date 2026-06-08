import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class FindInvestorsDto {
  @ApiProperty({ description: 'BuildProject UUID to find investors for' })
  @IsUUID('4')
  projectId: string;
}
