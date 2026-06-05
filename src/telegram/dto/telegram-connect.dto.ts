import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class TelegramConnectDto {
  @ApiPropertyOptional({
    description:
      'Telegram chat id. Omit it to receive a bot /start connection token.',
    example: '123456789',
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  chatId?: string;
}
