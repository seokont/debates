import { ApiProperty } from '@nestjs/swagger';
import { AiProvider } from '@prisma/client';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateUserApiKeyDto {
  @ApiProperty({
    enum: AiProvider,
    example: AiProvider.OPENAI,
  })
  @IsEnum(AiProvider)
  provider: AiProvider;

  @ApiProperty({
    example: 'sk-proj-...',
    minLength: 8,
    maxLength: 4096,
    writeOnly: true,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(4096)
  key: string;
}
