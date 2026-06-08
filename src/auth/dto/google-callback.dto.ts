import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUrl, MinLength } from 'class-validator';

export class GoogleCallbackDto {
  @ApiProperty({ description: 'Authorization code from Google OAuth callback' })
  @IsString()
  @MinLength(1)
  code: string;

  @ApiProperty({ description: 'Redirect URI that was used to initiate the OAuth flow' })
  @IsUrl({ require_tld: false })
  redirectUri: string;
}
