import { Body, Controller, Get, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { GoogleCallbackDto } from './dto/google-callback.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthenticatedUser } from './types/authenticated-user.type';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'Register user and issue tokens' })
  @ApiCreatedResponse({ description: 'User registered' })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @ApiOperation({ summary: 'Login user and issue tokens' })
  @ApiOkResponse({ description: 'User logged in' })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @ApiOperation({ summary: 'Rotate refresh token and issue new tokens' })
  @ApiOkResponse({ description: 'Tokens refreshed' })
  @ApiUnauthorizedResponse({ description: 'Invalid refresh token' })
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @ApiOperation({ summary: 'Get Google OAuth authorization URL' })
  @ApiQuery({ name: 'redirect_uri', required: true })
  @ApiOkResponse({ description: 'Google OAuth URL' })
  @Get('google/url')
  googleUrl(@Query('redirect_uri') redirectUri: string) {
    return { url: this.authService.getGoogleAuthUrl(redirectUri) };
  }

  @ApiOperation({ summary: 'Exchange Google OAuth code for JWT tokens' })
  @ApiCreatedResponse({ description: 'User authenticated via Google' })
  @Post('google/callback')
  googleCallback(@Body() dto: GoogleCallbackDto) {
    return this.authService.handleGoogleCallback(dto.code, dto.redirectUri);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiOkResponse({ description: 'Current user profile' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.id);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiOkResponse({ description: 'Updated user profile' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateMeDto) {
    return this.authService.updateMe(user.id, dto);
  }
}
