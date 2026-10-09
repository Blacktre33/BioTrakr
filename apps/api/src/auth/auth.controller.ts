import { Body, Controller, Get, Headers, HttpCode, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
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

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  currentPassword!: string;

  @ApiProperty({ description: 'At least 10 characters' })
  @IsString()
  @MaxLength(200)
  newPassword!: string;
}

export class RefreshDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  refreshToken!: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Exchange email and password for access and refresh tokens',
  })
  login(
    @Body() body: LoginDto,
    @Headers('user-agent') userAgent?: string,
  ): Promise<LoginResult> {
    return this.authService.login(body.email, body.password, userAgent);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Exchange a refresh token for a new pair. Each refresh token works once; reusing an old one ends the sign-in.',
  })
  refresh(
    @Body() body: RefreshDto,
    @Headers('user-agent') userAgent?: string,
  ): Promise<LoginResult> {
    return this.authService.refresh(body.refreshToken, userAgent);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'End the sign-in this refresh token belongs to' })
  async logout(@Body() body: RefreshDto): Promise<void> {
    await this.authService.logout(body.refreshToken);
  }

  @Post('change-password')
  @HttpCode(204)
  @Roles(...ALL_ROLES)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Set a new password (at least 10 characters). Ends every sign-in; sign in again with the new password.',
  })
  async changePassword(
    @Body() body: ChangePasswordDto,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.authService.changePassword(
      user.userId,
      body.currentPassword,
      body.newPassword,
    );
  }

  @Post('logout-all')
  @Roles(...ALL_ROLES)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sign out on every device' })
  async logoutAll(@CurrentUser() user: AuthUser): Promise<{ ended: number }> {
    return { ended: await this.authService.logoutEverywhere(user.userId) };
  }

  @Get('me')
  @Roles(...ALL_ROLES) // integration accounts may check who they are too
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The authenticated caller' })
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
