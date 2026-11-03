import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  AdminLoginSchema,
  CitiesSchema,
  CountriesSchema,
  CreateMethodologySchema,
  FaqSchema,
  FormatsSchema,
  JournalCallsQuerySchema,
  ThemeBriefSchema,
  type ThemeBrief,
  JournalPeriodQuerySchema,
  MethodologyPreviewSchema,
  PauseSchema,
  PinLayoutSchema,
  PricesSchema,
  UpdateBlockedSchema,
  UpdateMethodologySchema,
  UpdateOrderStatusSchema,
  UpdateTemplateSchema,
  CountryLandingSchema,
  CountryCitiesSchema,
  CountryDeliverySchema,
  CountryFormatOverridesSchema,
  type CountryDelivery,
  type CountryFormatOverrides,
  TemplateSampleSchema,
  TemplateVisibilitySchema,
  type CountryLanding,
  type TemplateSample,
  type TemplateVisibility,
  type AdminLogin,
  type AdminLoginOptions,
  type AdminMe,
  ADMIN_PERMISSIONS,
  isSuperAdmin,
  permissionsOf,
  rightsOf,
  type CountryEntry,
  type CreateMethodology,
  type FaqItem,
  type JournalCallsQuery,
  type MethodologyPreview,
  type PinLayout,
  type Prices,
  type PrintFormat,
  type UpdateBlocked,
  type UpdateMethodology,
  type UpdateTemplate,
} from '@fabulka/shared';
import type { Response } from 'express';
import type { ZodType, z } from 'zod';
import { Audit, AuditTrail, NoAudit, Trail } from '../audit/audit.interceptor';
import { AuthService } from '../auth/auth.service';
import { BooksService } from '../books/books.service';
import { CurrentClient, type Client } from '../common/client';
import { ZodPipe } from '../common/zod.pipe';
import { JournalAdminService } from '../journal/journal-admin.service';
import { MethodologiesService } from '../methodologies/methodologies.service';
import { OrdersService } from '../orders/orders.service';
import { ReferenceService } from '../reference/reference.service';
import { StaffCapsService } from '../staff/caps.service';
import { StorageService } from '../storage/storage.service';
import { ThemesService } from '../themes/themes.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminGuard, CurrentAdmin, RequirePermission } from './admin.guard';
import type { AdminSession } from './admin-auth.service';
import { AdminService } from './admin.service';
import { assertScope, listCountries, listScope } from './scope';

/** A body checked with `schema` (400 with the issues otherwise), for routes whose schema depends on a query. */
function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  return new ZodPipe(schema).transform(body);
}

/** A ?country= as an upper-case ISO code, or null when there is none. */
function countryParam(value: string | undefined): string | null {
  const code = value?.trim().toUpperCase();
  return code && /^[A-Z]{2}$/.test(code) ? code : null;
}

@Controller('admin')
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly signIn: AuthService,
  ) {}

  /** Which ways in the login page offers: Keycloak (/api/auth/login?return=/admin), the password. */
  @Get('login-options')
  loginOptions(): AdminLoginOptions {
    return {
      password: this.auth.passwordLoginReady,
      keycloak: this.signIn.enabled,
    };
  }

  /** The emergency email/password sign-in: 404 password_login_disabled unless ADMIN_PASSWORD_LOGIN=true. */
  @Post('login')
  @HttpCode(204)
  login(
    @Body(new ZodPipe(AdminLoginSchema)) body: AdminLogin,
    @CurrentClient() client: Client,
    @Res({ passthrough: true }) response: Response,
  ): void {
    const token = this.auth.login(body.email, body.password, client.ip);
    response.setHeader('Set-Cookie', this.auth.cookie(token));
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) response: Response): void {
    response.setHeader('Set-Cookie', this.auth.clearedCookie());
  }
}

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly bookService: BooksService,
    private readonly orders: OrdersService,
    private readonly journal: JournalAdminService,
    private readonly methodologies: MethodologiesService,
    private readonly reference: ReferenceService,
    private readonly storage: StorageService,
    private readonly themes: ThemesService,
    private readonly caps: StaffCapsService,
  ) {}

  /** Who is signed in, their roles and the sections they may open: any admin role may ask. */
  @Get('me')
  @RequirePermission(...ADMIN_PERMISSIONS)
  me(@CurrentAdmin() session: AdminSession): AdminMe {
    return {
      ok: true,
      who: session.who,
      roles: session.roles,
      permissions: permissionsOf(session),
      rights: rightsOf(session),
      global: session.global,
      countries: session.countries,
      superadmin: isSuperAdmin(session),
    };
  }

  /** The whole service's dashboard: global staff only (a country manager has /stats/countries). */
  @Get('stats')
  @RequirePermission('dashboard')
  stats(@CurrentAdmin() session: AdminSession) {
    assertScope(
      session,
      'dashboard',
      null,
      'The global dashboard is not yours: open your countries’ one',
    );
    return this.admin.stats();
  }

  /**
   * A dashboard of the session's countries only (?country= narrows to the working country): their
   * books, orders and spend today, no global numbers.
   */
  @Get('stats/countries')
  @RequirePermission('dashboard')
  countryStats(
    @CurrentAdmin() session: AdminSession,
    @Query('country') country?: string,
  ) {
    const scope = listScope(session, 'dashboard');
    return this.admin.countryStats(listCountries(scope, countryParam(country)));
  }

  /**
   * What the session may still spend today on staff generation (example translations, theme
   * proposals) for ?country= (none: an action for no country). Any admin role may ask.
   */
  @Get('caps/me')
  @RequirePermission(...ADMIN_PERMISSIONS)
  myBudget(
    @CurrentAdmin() session: AdminSession,
    @Query('country') country?: string,
  ) {
    return this.caps.budget(session, countryParam(country));
  }

  /** The generation pause: global staff only. */
  @Post('pause')
  @RequirePermission('dashboard')
  @Audit('generation.pause', { target: 'generation' })
  @HttpCode(204)
  pause(
    @Body(new ZodPipe(PauseSchema)) body: z.infer<typeof PauseSchema>,
    @CurrentAdmin() session: AdminSession,
    @Trail() trail: AuditTrail,
  ) {
    assertScope(session, 'dashboard', null, 'The pause is global staff’s');
    trail
      .as(body.paused ? 'generation.pause' : 'generation.resume')
      .note({ paused: body.paused });
    return this.admin.setPaused(body.paused);
  }

  @Get('books')
  @RequirePermission('books')
  books(@Query('status') status?: string) {
    return this.admin.listBooks(status);
  }

  /** For a country manager (catalog), only a public book or one made in their countries. */
  @Get('books/:id')
  @RequirePermission('books', 'catalog')
  book(@Param('id') id: string, @CurrentAdmin() session: AdminSession) {
    return this.admin.book(id, session);
  }

  /** The book's model calls in order: the timeline on its admin page. */
  @Get('books/:id/calls')
  @RequirePermission('books')
  bookCalls(@Param('id') id: string) {
    return this.journal.bookCalls(id);
  }

  /** Staff pin a page's layout or change the theme; the book is re-rendered and re-checked. */
  @Patch('books/:id/layout')
  @RequirePermission('books')
  @Audit('book.layout', { target: 'book' })
  async pinLayout(
    @Param('id') id: string,
    @Body(new ZodPipe(PinLayoutSchema)) body: PinLayout,
  ) {
    await this.bookService.pinLayout(id, body);
    return this.admin.book(id);
  }

  @Delete('books/:id')
  @RequirePermission('books')
  @Audit('book.delete', { target: 'book' })
  @HttpCode(204)
  deleteBook(@Param('id') id: string) {
    return this.admin.deleteBook(id);
  }

  /** A country manager's countries' orders only; ?country= narrows to the working country. */
  @Get('orders')
  @RequirePermission('orders')
  listOrders(
    @CurrentAdmin() session: AdminSession,
    @Query('country') country?: string,
  ) {
    return this.orders.list(session, country);
  }

  /** The order's print file: its frozen layout with bleed and crop marks (made on first request). */
  @Get('orders/:id/print.pdf')
  @RequirePermission('orders')
  async printFile(
    @Param('id') id: string,
    @CurrentAdmin() session: AdminSession,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.orders.printFile(id, session);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.name}"`,
    );
    response.sendFile(file.path, { root: this.storage.root });
  }

  @Patch('orders/:id')
  @RequirePermission('orders')
  @Audit('order.status', { target: 'order' })
  async setOrderStatus(
    @Param('id') id: string,
    @Body(new ZodPipe(UpdateOrderStatusSchema))
    body: z.infer<typeof UpdateOrderStatusSchema>,
    @CurrentAdmin() session: AdminSession,
    @Trail() trail: AuditTrail,
  ) {
    const before = await this.orders.currentStatus(id);
    const order = await this.orders.setStatus(
      id,
      body.status,
      body.note,
      session,
    );
    trail
      .in(order.country)
      .diff({ status: before?.status ?? null }, { status: order.status })
      .note(body.note ? { note: body.note } : {});
    return order;
  }

  @Get('journal/stats')
  @RequirePermission('journal')
  journalStats(
    @Query(new ZodPipe(JournalPeriodQuerySchema))
    query: z.infer<typeof JournalPeriodQuerySchema>,
  ) {
    return this.journal.stats(query.period);
  }

  @Get('journal/calls')
  @RequirePermission('journal')
  journalCalls(
    @Query(new ZodPipe(JournalCallsQuerySchema)) query: JournalCallsQuery,
  ) {
    return this.journal.calls(query);
  }

  @Get('journal/calls/:id')
  @RequirePermission('journal')
  journalCall(@Param('id') id: string) {
    return this.journal.call(id);
  }

  @Get('journal/errors')
  @RequirePermission('journal')
  journalErrors(
    @Query(new ZodPipe(JournalPeriodQuerySchema))
    query: z.infer<typeof JournalPeriodQuerySchema>,
  ) {
    return this.journal.errors(query.period);
  }

  /** Curated themes (read-only) and the ones Muse Spark proposed, with their checks and previews. */
  @Get('themes')
  @RequirePermission('themes', 'catalog')
  listThemes() {
    return this.themes.adminList();
  }

  /**
   * Muse Spark proposes a theme for the owner's brief; it is checked (fonts, contrast, sizes,
   * glyphs, a sample book in every language) and stored as a draft. 422 theme_refused with the checks
   * when one fails.
   */
  @Post('themes')
  @RequirePermission('themes')
  @Audit('theme.propose', { target: 'theme' })
  async proposeTheme(
    @Body(new ZodPipe(ThemeBriefSchema)) body: ThemeBrief,
    @CurrentAdmin() session: AdminSession,
    @Trail() trail: AuditTrail,
  ) {
    // Paid models on staff's behalf: within the person's daily cap (429 staff_cap_reached).
    await this.caps.assert(session, null);
    const theme = await this.themes.propose(
      body.brief,
      StaffCapsService.context(session, null),
    );
    trail.target('theme', theme.theme.id).note({ brief: body.brief });
    return theme;
  }

  @Post('themes/:id/publish')
  @RequirePermission('themes')
  @Audit('theme.publish', { target: 'theme' })
  @HttpCode(200)
  publishTheme(@Param('id') id: string) {
    return this.themes.publish(id, true);
  }

  /** Takes a published theme back: no longer offered; books keep theirs, catalog books pick by age. */
  @Post('themes/:id/unpublish')
  @RequirePermission('themes')
  @Audit('theme.unpublish', { target: 'theme' })
  @HttpCode(200)
  unpublishTheme(@Param('id') id: string) {
    return this.themes.publish(id, false);
  }

  @Delete('themes/:id')
  @RequirePermission('themes')
  @Audit('theme.delete', { target: 'theme' })
  @HttpCode(204)
  deleteTheme(@Param('id') id: string) {
    return this.themes.remove(id);
  }

  @Get('templates')
  @RequirePermission('catalog')
  templates() {
    return this.admin.listTemplates();
  }

  @Get('templates/:slug')
  @RequirePermission('catalog')
  template(@Param('slug') slug: string, @CurrentAdmin() session: AdminSession) {
    return this.admin.template(slug, session);
  }

  /** Content, countries and global samples: global staff only (403 scope_forbidden otherwise). */
  @Patch('templates/:slug')
  @RequirePermission('catalog')
  @Audit('template.update', { target: 'template' })
  async updateTemplate(
    @Param('slug') slug: string,
    @Body(new ZodPipe(UpdateTemplateSchema)) body: UpdateTemplate,
    @CurrentAdmin() session: AdminSession,
    @Trail() trail: AuditTrail,
  ) {
    const before = await this.admin.template(slug, session);
    const after = await this.admin.updateTemplate(slug, body, session);
    trail.in(null).diff(before, after);
    return after;
  }

  /** Shows or hides the catalog book in one country (a country manager: one of theirs). */
  @Put('templates/:slug/visibility')
  @RequirePermission('catalog')
  @Audit('template.visibility', { target: 'template' })
  setTemplateVisibility(
    @Param('slug') slug: string,
    @Body(new ZodPipe(TemplateVisibilitySchema)) body: TemplateVisibility,
    @CurrentAdmin() session: AdminSession,
    @Trail() trail: AuditTrail,
  ) {
    trail.in(body.country).note({ visible: body.visible });
    return this.admin.setVisibility(slug, body.country, body.visible, session);
  }

  /** Sets or clears a sample: global (global staff) or one country's (a country manager: theirs). */
  @Put('templates/:slug/samples')
  @RequirePermission('catalog')
  @Audit('template.sample', { target: 'template' })
  setTemplateSample(
    @Param('slug') slug: string,
    @Body(new ZodPipe(TemplateSampleSchema)) body: TemplateSample,
    @CurrentAdmin() session: AdminSession,
    @Trail() trail: AuditTrail,
  ) {
    trail
      .in(body.country)
      .note({ language: body.language, bookId: body.bookId });
    return this.admin.setSample(
      slug,
      body.country,
      body.language,
      body.bookId,
      session,
    );
  }

  @Get('methodologies')
  @RequirePermission('methodologies', 'catalog')
  listMethodologies() {
    return this.methodologies.adminList();
  }

  /** The method part of the story prompt for a sample child, from the editor's unsaved fields. */
  @Post('methodologies/preview')
  @RequirePermission('methodologies')
  @NoAudit()
  @HttpCode(200)
  previewMethodology(
    @Body(new ZodPipe(MethodologyPreviewSchema)) body: MethodologyPreview,
  ) {
    return this.methodologies.preview(body);
  }

  @Get('methodologies/:slug')
  @RequirePermission('methodologies')
  methodology(@Param('slug') slug: string) {
    return this.methodologies.adminGet(slug);
  }

  @Post('methodologies')
  @RequirePermission('methodologies')
  @Audit('methodology.create', { target: 'methodology' })
  createMethodology(
    @Body(new ZodPipe(CreateMethodologySchema)) body: CreateMethodology,
  ) {
    return this.methodologies.create(body);
  }

  @Put('methodologies/:slug')
  @RequirePermission('methodologies')
  @Audit('methodology.update', { target: 'methodology' })
  async updateMethodology(
    @Param('slug') slug: string,
    @Body(new ZodPipe(UpdateMethodologySchema)) body: UpdateMethodology,
    @Trail() trail: AuditTrail,
  ) {
    const before = await this.methodologies.adminGet(slug);
    const after = await this.methodologies.update(slug, body);
    trail.diff(before, after);
    return after;
  }

  /** 409 methodology_in_use while catalog books or books follow it: unpublish it instead. */
  @Delete('methodologies/:slug')
  @RequirePermission('methodologies')
  @Audit('methodology.delete', { target: 'methodology' })
  @HttpCode(204)
  deleteMethodology(@Param('slug') slug: string) {
    return this.methodologies.remove(slug);
  }

  /** Prices, delivery cities and blocked countries (Meta's, read-only, and the owner's). */
  @Get('reference')
  @RequirePermission(
    'reference',
    'reference.prices',
    'reference.landing',
    'reference.cities',
    'reference.delivery',
    'reference.formats_country',
    'catalog',
    'methodologies',
  )
  referenceData() {
    return this.reference.admin();
  }

  /**
   * The global prices (no ?country=: global staff only), or one country's own list (?country=XX:
   * reference.prices in that country), which its visitors are priced from instead.
   */
  @Put('reference/prices')
  @RequirePermission('reference.prices')
  @Audit('prices.set', { target: 'prices' })
  async setPrices(
    @Body(new ZodPipe(PricesSchema)) body: Prices,
    @CurrentAdmin() session: AdminSession,
    @Trail() trail: AuditTrail,
    @Query('country') country?: string,
  ) {
    const code = countryParam(country);
    assertScope(
      session,
      'reference.prices',
      code ? [code] : null,
      code
        ? 'Not one of your countries'
        : 'The global prices are not yours to change',
    );
    const before = await this.reference.admin();
    trail.target('prices', code ?? 'global').in(code);
    if (!code) {
      const after = await this.reference.setPrices(body);
      trail.diff(before.prices, after);
      return after;
    }
    const after = (await this.reference.setCountryPrices(code, body))[code];
    trail.diff(before.countryPrices[code] ?? null, after);
    return after;
  }

  /** The country is priced from the global list again. */
  @Delete('reference/prices')
  @RequirePermission('reference.prices')
  @Audit('prices.clear', { target: 'prices' })
  @HttpCode(204)
  async clearCountryPrices(
    @CurrentAdmin() session: AdminSession,
    @Trail() trail: AuditTrail,
    @Query('country') country?: string,
  ) {
    const code = countryParam(country);
    assertScope(
      session,
      'reference.prices',
      code ? [code] : null,
      'Not one of your countries',
    );
    if (!code) throw new BadRequestException('?country= is required');
    const before = (await this.reference.admin()).countryPrices[code] ?? null;
    await this.reference.setCountryPrices(code, null);
    trail.target('prices', code).in(code).diff(before, null);
  }

  /** One country's landing overrides (hero, FAQ, sections): reference.landing in that country. */
  @Put('reference/landing')
  @RequirePermission('reference.landing')
  @Audit('landing.set', { target: 'landing' })
  async setLanding(
    @Body(new ZodPipe(CountryLandingSchema)) body: CountryLanding,
    @CurrentAdmin() session: AdminSession,
    @Trail() trail: AuditTrail,
    @Query('country') country?: string,
  ) {
    const code = countryParam(country);
    assertScope(
      session,
      'reference.landing',
      code ? [code] : null,
      'Not one of your countries',
    );
    if (!code) throw new BadRequestException('?country= is required');
    const before = (await this.reference.admin()).landing[code] ?? null;
    const after = (await this.reference.setLanding(code, body))[code];
    trail.target('landing', code).in(code).diff(before, after);
    return after;
  }

  /** The country's landing shows the defaults again. */
  @Delete('reference/landing')
  @RequirePermission('reference.landing')
  @Audit('landing.clear', { target: 'landing' })
  @HttpCode(204)
  async clearLanding(
    @CurrentAdmin() session: AdminSession,
    @Trail() trail: AuditTrail,
    @Query('country') country?: string,
  ) {
    const code = countryParam(country);
    assertScope(
      session,
      'reference.landing',
      code ? [code] : null,
      'Not one of your countries',
    );
    if (!code) throw new BadRequestException('?country= is required');
    const before = (await this.reference.admin()).landing[code] ?? null;
    await this.reference.setLanding(code, null);
    trail.target('landing', code).in(code).diff(before, null);
  }

  /**
   * Delivery cities: one country's (?country=XX: reference.cities there), or the whole list of every
   * country (global staff). Ids stay as they are: orders refer to them.
   */
  @Put('reference/cities')
  @RequirePermission('reference.cities')
  @Audit('cities.set', { target: 'cities' })
  async setCities(
    @Body() body: unknown,
    @CurrentAdmin() session: AdminSession,
    @Trail() trail: AuditTrail,
    @Query('country') country?: string,
  ) {
    const code = countryParam(country);
    assertScope(
      session,
      'reference.cities',
      code ? [code] : null,
      code
        ? 'Not one of your countries'
        : "Every country's cities are not yours to change",
    );
    const before = (await this.reference.admin()).cities.filter(
      (c) => !code || c.country === code,
    );
    trail.target('cities', code ?? 'global').in(code);
    const after = code
      ? await this.reference.setCountryCities(
          code,
          parseBody(CountryCitiesSchema, body),
        )
      : await this.reference.setCities(parseBody(CitiesSchema, body));
    trail.diff(before, after);
    return after;
  }

  /**
   * The delivery fee: one country's own fee and free-delivery rule (?country=XX:
   * reference.delivery there), or the global fee countries without one pay (global staff).
   */
  @Put('reference/delivery')
  @RequirePermission('reference.delivery')
  @Audit('delivery.set', { target: 'delivery' })
  async setDelivery(
    @Body(new ZodPipe(CountryDeliverySchema)) body: CountryDelivery,
    @CurrentAdmin() session: AdminSession,
    @Trail() trail: AuditTrail,
    @Query('country') country?: string,
  ) {
    const code = countryParam(country);
    assertScope(
      session,
      'reference.delivery',
      code ? [code] : null,
      code
        ? 'Not one of your countries'
        : 'The global delivery fee is not yours to change',
    );
    const before = await this.reference.admin();
    trail.target('delivery', code ?? 'global').in(code);
    if (!code) {
      const prices = await this.reference.setDeliveryFee(body.feeKzt);
      trail.diff(
        { feeKzt: before.prices.deliveryKzt },
        { feeKzt: prices.deliveryKzt },
      );
      return { feeKzt: prices.deliveryKzt, freeEverywhere: false };
    }
    const after = (await this.reference.setCountryDelivery(code, body))[code];
    trail.diff(before.countryDelivery[code] ?? null, after);
    return after;
  }

  /** The country pays the global delivery fee again. */
  @Delete('reference/delivery')
  @RequirePermission('reference.delivery')
  @Audit('delivery.clear', { target: 'delivery' })
  @HttpCode(204)
  async clearDelivery(
    @CurrentAdmin() session: AdminSession,
    @Trail() trail: AuditTrail,
    @Query('country') country?: string,
  ) {
    const code = countryParam(country);
    assertScope(
      session,
      'reference.delivery',
      code ? [code] : null,
      'Not one of your countries',
    );
    if (!code) throw new BadRequestException('?country= is required');
    const before = (await this.reference.admin()).countryDelivery[code] ?? null;
    await this.reference.setCountryDelivery(code, null);
    trail.target('delivery', code).in(code).diff(before, null);
  }

  /**
   * One country's print formats: which are offered there and their cover prices
   * (reference.formats_country there). Sizes and ids stay global (PUT reference/formats).
   */
  @Put('reference/country-formats')
  @RequirePermission('reference.formats_country')
  @Audit('formats_country.set', { target: 'formats_country' })
  async setCountryFormats(
    @Body(new ZodPipe(CountryFormatOverridesSchema))
    body: CountryFormatOverrides,
    @CurrentAdmin() session: AdminSession,
    @Trail() trail: AuditTrail,
    @Query('country') country?: string,
  ) {
    const code = countryParam(country);
    assertScope(
      session,
      'reference.formats_country',
      code ? [code] : null,
      'Not one of your countries',
    );
    if (!code) throw new BadRequestException('?country= is required');
    const before = (await this.reference.admin()).countryFormats[code] ?? null;
    const after = (await this.reference.setCountryFormats(code, body))[code];
    trail.target('formats_country', code).in(code).diff(before, after);
    return after;
  }

  /** The country offers and prices formats as globally again. */
  @Delete('reference/country-formats')
  @RequirePermission('reference.formats_country')
  @Audit('formats_country.clear', { target: 'formats_country' })
  @HttpCode(204)
  async clearCountryFormats(
    @CurrentAdmin() session: AdminSession,
    @Trail() trail: AuditTrail,
    @Query('country') country?: string,
  ) {
    const code = countryParam(country);
    assertScope(
      session,
      'reference.formats_country',
      code ? [code] : null,
      'Not one of your countries',
    );
    if (!code) throw new BadRequestException('?country= is required');
    const before = (await this.reference.admin()).countryFormats[code] ?? null;
    await this.reference.setCountryFormats(code, null);
    trail.target('formats_country', code).in(code).diff(before, null);
  }

  /**
   * The countries the site offers. 400 country_policy_blocked for a code on Meta's list,
   * country_blocked for one the owner blocked.
   */
  @Put('reference/countries')
  @RequirePermission('reference')
  @Audit('countries.set', { target: 'countries' })
  async setCountries(
    @Body(new ZodPipe(CountriesSchema)) body: CountryEntry[],
    @Trail() trail: AuditTrail,
  ) {
    const before = await this.reference.countries();
    const after = await this.reference.setCountries(body);
    trail.in(null).diff(before, after);
    return after;
  }

  /** The landing's questions, in order; drafts (published: false) stay off the site. */
  @Put('reference/faq')
  @RequirePermission('reference')
  @Audit('faq.set', { target: 'faq' })
  async setFaq(
    @Body(new ZodPipe(FaqSchema)) body: FaqItem[],
    @Trail() trail: AuditTrail,
  ) {
    const before = (await this.reference.admin()).faq;
    const after = await this.reference.setFaq(body);
    trail.in(null).diff(before, after);
    return after;
  }

  /** Print formats in the order form's order: sizes, bleed, safe zone and prices by cover (tenge). */
  @Put('reference/formats')
  @RequirePermission('reference')
  @Audit('formats.set', { target: 'formats' })
  async setFormats(
    @Body(new ZodPipe(FormatsSchema)) body: PrintFormat[],
    @Trail() trail: AuditTrail,
  ) {
    const before = await this.reference.formats();
    const after = await this.reference.setFormats(body);
    trail.in(null).diff(before, after);
    return after;
  }

  /** 400 country_policy_blocked for a code on Meta's list: that list cannot be edited here. */
  @Put('reference/blocked')
  @RequirePermission('reference')
  @Audit('blocked.set', { target: 'blocked' })
  async setBlocked(
    @Body(new ZodPipe(UpdateBlockedSchema)) body: UpdateBlocked,
    @Trail() trail: AuditTrail,
  ) {
    const before = (await this.reference.admin()).blocked.extra;
    const after = await this.reference.setExtraBlocked(body.extra);
    trail.in(null).diff({ extra: before }, { extra: after.extra });
    return after;
  }
}
