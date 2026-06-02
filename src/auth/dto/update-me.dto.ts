import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class UpdateMeDto {
  @ApiPropertyOptional({ example: 'debater', maxLength: 32, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  username?: string | null;

  @ApiPropertyOptional({
    example: 'https://example.com/avatar.png',
    maxLength: 2048,
    nullable: true,
  })
  @IsOptional()
  @IsUrl({ require_protocol: true }, { message: 'avatarUrl must be a valid URL' })
  @MaxLength(2048)
  avatarUrl?: string | null;
}
