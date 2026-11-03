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
import { Audit, AuditTrail, Trail } from '../audit/audit.interceptor';
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

/**
 * The admin's «SEO» section: open to every role with the `seo` permission (admin included). SEO
 * keeps its own history with values and revert (SeoHistory); its Activity events only say what was
 * done and point at that history.
 */
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
  @Audit('seo.save', { target: 'seo_page' })
  save(
    @Body(new ZodPipe(SaveSeoPageSchema)) body: SaveSeoPage,
    @CurrentAdmin() admin: AdminSession,
    @Trail() trail: AuditTrail,
  ): Promise<AdminSeoPage> {
    trail
      .target('seo_page', seoPageTarget(body.key, body.language))
      .in(null)
      .note({ history: 'page', key: body.key, language: body.language });
    return this.seo.save(body.key, body.language, body.fields, admin.who);
  }

  /** { key, language } publishes one page; {} every page with unpublished changes. */
  @Post('publish')
  @Audit('seo.publish', { target: 'seo_page' })
  @HttpCode(200)
  async publish(
    @Body(new ZodPipe(PublishSeoSchema)) body: PublishSeo,
    @CurrentAdmin() admin: AdminSession,
    @Trail() trail: AuditTrail,
  ): Promise<PublishSeoResult> {
    const target =
      'key' in body && typeof body.key === 'string'
        ? { key: body.key, language: body.language }
        : null;
    const result = await this.seo.publish(target, admin.who);
    trail
      .target(
        'seo_page',
        target ? seoPageTarget(target.key, target.language) : null,
      )
      .in(null)
      .note({
        history: 'page',
        ...(target ? { key: target.key, language: target.language } : {}),
        published: result.published,
        urls: result.urls.slice(0, 20),
      });
    return result;
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
  @Audit('seo.revert', { target: 'seo_history' })
  @HttpCode(200)
  async revert(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminSession,
    @Trail() trail: AuditTrail,
  ): Promise<AdminSeoPage> {
    const page = await this.seo.revert(id, admin.who);
    trail.in(null).note({ history: 'page', entry: id, key: page.key });
    return page;
  }

  @Post('og-image')
  @Audit('seo.image', { target: 'seo_image' })
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
  @Audit('seo.redirect_create', { target: 'redirect' })
  async createRedirect(
    @Body(new ZodPipe(RedirectInputSchema)) body: RedirectInput,
    @CurrentAdmin() admin: AdminSession,
    @Trail() trail: AuditTrail,
  ): Promise<Redirect> {
    const redirect = await this.seo.createRedirect(body, admin.who);
    trail
      .target('redirect', redirect.id)
      .in(null)
      .note({ history: 'redirect' });
    return redirect;
  }

  @Put('redirects/:id')
  @Audit('seo.redirect_update', { target: 'redirect' })
  updateRedirect(
    @Param('id') id: string,
    @Body(new ZodPipe(RedirectInputSchema)) body: RedirectInput,
    @CurrentAdmin() admin: AdminSession,
    @Trail() trail: AuditTrail,
  ): Promise<Redirect> {
    trail.in(null).note({ history: 'redirect' });
    return this.seo.updateRedirect(id, body, admin.who);
  }

  @Delete('redirects/:id')
  @Audit('seo.redirect_delete', { target: 'redirect' })
  @HttpCode(204)
  deleteRedirect(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminSession,
    @Trail() trail: AuditTrail,
  ): Promise<void> {
    trail.in(null).note({ history: 'redirect' });
    return this.seo.deleteRedirect(id, admin.who);
  }

  @Get('settings')
  settings(): Promise<SeoSettings> {
    return this.seo.settings();
  }

  @Put('settings')
  @Audit('seo.settings', { target: 'seo_settings' })
  saveSettings(
    @Body(new ZodPipe(SeoSettingsSchema)) body: SeoSettings,
    @CurrentAdmin() admin: AdminSession,
    @Trail() trail: AuditTrail,
  ) {
    trail.in(null).note({ history: 'settings' });
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
