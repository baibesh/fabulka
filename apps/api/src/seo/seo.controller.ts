import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  LanguageSchema,
  PublishSeoSchema,
  RedirectInputSchema,
  SaveSeoPageSchema,
  SeoImageUploadSchema,
  SeoPageKeySchema,
  SeoSettingsSchema,
  seoPageTarget,
  type AdminSeoPage,
  type Language,
  type PublicRedirect,
  type PublicSeoPages,
  type PublishSeo,
  type PublishSeoResult,
  type Redirect,
  type RedirectInput,
  type SaveSeoPage,
  type SeoHistoryEntry,
  type SeoSettings,
} from '@fabulka/shared';
import type { Response } from 'express';
import type { z } from 'zod';
import type { AdminSession } from '../admin/admin-auth.service';
import {
  AdminGuard,
  CurrentAdmin,
  RequirePermission,
} from '../admin/admin.guard';
import { AuthService } from '../auth/auth.service';
import { ZodPipe } from '../common/zod.pipe';
import { SeoWebService } from './seo-web.service';
import { SeoService } from './seo.service';

function language(value: unknown): Language {
  const parsed = LanguageSchema.safeParse(value);
  if (!parsed.success) throw new NotFoundException('Unknown language');
  return parsed.data;
}

function pageKey(value: unknown): string {
  const parsed = SeoPageKeySchema.safeParse(value);
  if (!parsed.success) throw new NotFoundException('Unknown page');
  return parsed.data;
}

/** What the site reads to render its SEO (public: it all ends up in the HTML anyway). */
@Controller('seo')
export class SeoController {
  constructor(
    private readonly seo: SeoService,
    private readonly web: SeoWebService,
  ) {}

  /** ?lang=xx: the published SEO of every page that has any in that language. */
  @Get('pages')
  pages(@Query('lang') lang: unknown): Promise<PublicSeoPages> {
    return this.seo.publicPages(language(lang));
  }

  /** Verification codes, analytics ids, extra robots.txt lines, the sitemap switch. */
  @Get('settings')
  settings(): Promise<SeoSettings> {
    return this.seo.settings();
  }

  /** The active redirects, for the site's proxy. */
  @Get('redirects')
  redirects(): Promise<PublicRedirect[]> {
    return this.seo.publicRedirects();
  }

  /** The IndexNow key file (the site serves it at /<key>.txt); 404 for any other key. */
  @Get('indexnow/:key')
  indexNowKey(@Param('key') key: string, @Res() response: Response): void {
    if (!this.web.indexNowKey || key !== this.web.indexNowKey) {
      throw new NotFoundException();
    }
    response.type('text/plain').send(this.web.indexNowKey);
  }
}

/** The admin's «SEO» section: open to every role with the `seo` permission (admin included). */
@Controller('admin/seo')
@UseGuards(AdminGuard)
@RequirePermission('seo')
export class SeoAdminController {
  constructor(private readonly seo: SeoService) {}

  @Get('pages')
  pages(@Query('lang') lang: unknown): Promise<AdminSeoPage[]> {
    return this.seo.pages(language(lang));
  }

  /** Unpublished changes by language: { de: 2 }. */
  @Get('pending')
  pending(): Promise<Record<string, number>> {
    return this.seo.pendingCounts();
  }

  @Get('page')
  page(
    @Query('key') key: unknown,
    @Query('lang') lang: unknown,
  ): Promise<AdminSeoPage> {
    return this.seo.page(pageKey(key), language(lang));
  }

  /** Saves the draft; the site keeps the published version until a publish. */
  @Put('page')
  save(
    @Body(new ZodPipe(SaveSeoPageSchema)) body: SaveSeoPage,
    @CurrentAdmin() admin: AdminSession,
  ): Promise<AdminSeoPage> {
    return this.seo.save(body.key, body.language, body.fields, admin.who);
  }

  /** { key, language } publishes one page; {} every page with unpublished changes. */
  @Post('publish')
  @HttpCode(200)
  publish(
    @Body(new ZodPipe(PublishSeoSchema)) body: PublishSeo,
    @CurrentAdmin() admin: AdminSession,
  ): Promise<PublishSeoResult> {
    const target =
      'key' in body && typeof body.key === 'string'
        ? { key: body.key, language: body.language }
        : null;
    return this.seo.publish(target, admin.who);
  }

  /** ?key=&lang= a page's changes; ?kind=redirect|settings the others. */
  @Get('history')
  history(
    @Query('key') key: unknown,
    @Query('lang') lang: unknown,
    @Query('kind') kind: unknown,
  ): Promise<SeoHistoryEntry[]> {
    if (kind === 'redirect' || kind === 'settings') {
      return this.seo.history(kind);
    }
    return this.seo.history(
      'page',
      seoPageTarget(pageKey(key), language(lang)),
    );
  }

  /** Puts the page's values from before that change back into its draft. */
  @Post('history/:id/revert')
  @HttpCode(200)
  revert(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminSession,
  ): Promise<AdminSeoPage> {
    return this.seo.revert(id, admin.who);
  }

  @Post('og-image')
  uploadImage(
    @Body(new ZodPipe(SeoImageUploadSchema))
    body: z.infer<typeof SeoImageUploadSchema>,
  ) {
    return this.seo.uploadImage(body.image);
  }

  @Get('redirects')
  redirects(): Promise<Redirect[]> {
    return this.seo.redirects();
  }

  @Post('redirects')
  createRedirect(
    @Body(new ZodPipe(RedirectInputSchema)) body: RedirectInput,
    @CurrentAdmin() admin: AdminSession,
  ): Promise<Redirect> {
    return this.seo.createRedirect(body, admin.who);
  }

  @Put('redirects/:id')
  updateRedirect(
    @Param('id') id: string,
    @Body(new ZodPipe(RedirectInputSchema)) body: RedirectInput,
    @CurrentAdmin() admin: AdminSession,
  ): Promise<Redirect> {
    return this.seo.updateRedirect(id, body, admin.who);
  }

  @Delete('redirects/:id')
  @HttpCode(204)
  deleteRedirect(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminSession,
  ): Promise<void> {
    return this.seo.deleteRedirect(id, admin.who);
  }

  @Get('settings')
  settings(): Promise<SeoSettings> {
    return this.seo.settings();
  }

  @Put('settings')
  saveSettings(
    @Body(new ZodPipe(SeoSettingsSchema)) body: SeoSettings,
    @CurrentAdmin() admin: AdminSession,
  ) {
    return this.seo.saveSettings(body, admin.who);
  }
}

/**
 * For E2E flows only (AUTH_MOCK=true, never in production): an IndexNow endpoint that remembers
 * what it was sent (INDEXNOW_ENDPOINT points here in e2e/start-stack.sh).
 */
@Controller('test/indexnow')
export class TestIndexNowController {
  private static readonly pings: { at: string; body: unknown }[] = [];

  constructor(private readonly auth: AuthService) {}

  private get on(): boolean {
    return this.auth.mock;
  }

  @Post()
  @HttpCode(202)
  ping(@Body() body: unknown): void {
    if (!this.on) throw new NotFoundException();
    TestIndexNowController.pings.unshift({
      at: new Date().toISOString(),
      body,
    });
    TestIndexNowController.pings.splice(50);
  }

  @Get()
  list() {
    if (!this.on) throw new NotFoundException();
    return TestIndexNowController.pings;
  }
}
