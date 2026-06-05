import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({
    example: 'Хороший аргумент, но в реальных компаниях это часто работает иначе.',
    minLength: 1,
    maxLength: 2000,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content: string;

  @ApiPropertyOptional({
    example: '4b8a7f91-0a3b-4b68-ae30-f3b2b4f41d2c',
    description: 'Parent comment UUID for replies',
  })
  @IsOptional()
  @IsUUID('4')
  parentId?: string;
}
