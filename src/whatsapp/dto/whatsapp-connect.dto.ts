import { ApiProperty } from '@nestjs/swagger';
import { IsPhoneNumber } from 'class-validator';

export class WhatsAppConnectDto {
  @ApiProperty({ example: '+15551234567', description: 'E.164 phone number' })
  @IsPhoneNumber()
  phoneNumber: string;
}
