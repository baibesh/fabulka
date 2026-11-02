import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { AuthLogout, AuthMe } from '@fabulka/shared';
import type { Request, Response } from 'express';
import { AuthService, type AuthRedirect } from './auth.service';
import { CurrentUser, type SessionUser } from './current-user';

/** Sign-in with Keycloak; see AuthService. The web proxies /api, so these run on its origin. */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** ?return=/path&lang=ru&key=<visitor key> → Keycloak (or the fake provider). */
  @Get('login')
  async login(
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ): Promise<void> {
    redirect(response, await this.auth.login(query));
  }

  @Get('callback')
  async callback(
    @Query() query: Record<string, unknown>,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    redirect(response, await this.auth.callback(query, request.headers.cookie));
  }

  /** { return: "/ru/catalog" }: the page to come back to, with its language prefix. */
  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: { return?: unknown } | undefined,
  ): Promise<AuthLogout> {
    const { url, cookies } = await this.auth.logout(
      request.headers.cookie,
      body?.return,
    );
    response.setHeader('Set-Cookie', cookies);
    return { url };
  }

  @Get('me')
  me(
    @CurrentUser() user: SessionUser | null,
    @Res({ passthrough: true }) response: Response,
  ): AuthMe {
    response.setHeader('Cache-Control', 'no-store');
    return this.auth.me(user);
  }

  /**
   * The fake provider's sign-in page (AUTH_MOCK=true only). With Accept: application/json it
   * answers { state }, so an API-only flow can drive the sign-in without parsing HTML.
   */
  @Get('mock')
  mockPage(
    @Query('state') state: unknown,
    @Query('invalid') invalid: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ): void {
    if (!this.auth.mock) throw new NotFoundException();
    const value = typeof state === 'string' ? state : '';
    response.setHeader('Cache-Control', 'no-store');
    if (request.headers.accept?.includes('application/json')) {
      response.json({ state: value });
      return;
    }
    response.type('html').send(mockLoginPage(value, !!invalid));
  }

  @Get('mock/authorize')
  mockAuthorize(
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ): void {
    if (!this.auth.mock) throw new NotFoundException();
    response.redirect(302, this.auth.mockAuthorize(query));
  }
}

function redirect(response: Response, { location, cookies }: AuthRedirect) {
  if (cookies.length) response.setHeader('Set-Cookie', cookies);
  response.setHeader('Cache-Control', 'no-store');
  response.redirect(302, location);
}

function mockLoginPage(state: string, invalid: boolean): string {
  const escaped = state.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Test sign-in</title>
<style>body{font-family:system-ui,sans-serif;max-width:360px;margin:64px auto;padding:0 16px}
label{display:block;margin:12px 0}input[type=email]{width:100%;padding:8px;font-size:16px}
button{padding:10px 16px;font-size:16px}.error{color:#b00020}</style></head>
<body><h1>Test sign-in</h1><p>Fake identity provider for E2E runs (AUTH_MOCK=true).</p>
${invalid ? '<p class="error" data-testid="mock-login-error">Enter a valid email.</p>' : ''}
<form method="get" action="/api/auth/mock/authorize">
<input type="hidden" name="state" value="${escaped}">
<label>Email <input type="email" name="email" required data-testid="mock-login-email" autocomplete="off"></label>
<label><input type="checkbox" name="admin" data-testid="mock-login-admin"> Realm role admin</label>
<label><input type="checkbox" name="seo" data-testid="mock-login-seo"> Realm role seo</label>
<button type="submit" data-testid="mock-login-submit">Sign in</button>
</form></body></html>`;
}
