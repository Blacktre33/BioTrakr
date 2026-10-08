import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

import type { AuthUser } from './auth-user';
import { AuthService, LoginResult } from './auth.service';
import { CurrentUser, Public, Roles } from './decorators';
import { ALL_ROLES } from './roles';

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}

export class RefreshDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  refreshToken!: string;
}

/** 5 attempts per minute per client on credential endpoints. */
const CREDENTIAL_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle(CREDENTIAL_THROTTLE)
  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Exchange email and password for access and refresh tokens',
  })
  login(@Body() body: LoginDto): Promise<LoginResult> {
    return this.authService.login(body.email, body.password);
  }

  @Public()
  @Throttle(CREDENTIAL_THROTTLE)
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Exchange a refresh token for a new token pair' })
  refresh(@Body() body: RefreshDto): Promise<LoginResult> {
    return this.authService.refresh(body.refreshToken);
  }

  @Get('me')
  @Roles(...ALL_ROLES) // integration accounts may check who they are too
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The authenticated caller' })
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
