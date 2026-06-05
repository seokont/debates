import { ApiProperty } from '@nestjs/swagger';
import { InjectionType } from '@prisma/client';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateInjectionDto {
  @ApiProperty({
    enum: InjectionType,
    example: InjectionType.ATTACK,
  })
  @IsEnum(InjectionType)
  type: InjectionType;

  @ApiProperty({
    example:
      'Вы не учли, что в реальной компании менеджмент выполняет политическую функцию.',
    minLength: 3,
    maxLength: 2000,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  content: string;
}
