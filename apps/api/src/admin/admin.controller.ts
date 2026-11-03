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
import { AuthService } from '../auth/auth.service';
import { BooksService } from '../books/books.service';
import { CurrentClient, type Client } from '../common/client';
import { ZodPipe } from '../common/zod.pipe';
import { JournalAdminService } from '../journal/journal-admin.service';
import { MethodologiesService } from '../methodologies/methodologies.service';
import { OrdersService } from '../orders/orders.service';
import { ReferenceService } from '../reference/reference.service';
import { StorageService } from '../storage/storage.service';
import { ThemesService } from '../themes/themes.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminGuard, CurrentAdmin, RequirePermission } from './admin.guard';
import type { AdminSession } from './admin-auth.service';
import { AdminService } from './admin.service';
import { assertScope } from './scope';

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

  @Get('stats')
  @RequirePermission('dashboard')
  stats() {
    return this.admin.stats();
  }

  @Post('pause')
  @RequirePermission('dashboard')
  @HttpCode(204)
  pause(@Body(new ZodPipe(PauseSchema)) body: z.infer<typeof PauseSchema>) {
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
  async pinLayout(
    @Param('id') id: string,
    @Body(new ZodPipe(PinLayoutSchema)) body: PinLayout,
  ) {
    await this.bookService.pinLayout(id, body);
    return this.admin.book(id);
  }

  @Delete('books/:id')
  @RequirePermission('books')
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
  setOrderStatus(
    @Param('id') id: string,
    @Body(new ZodPipe(UpdateOrderStatusSchema))
    body: z.infer<typeof UpdateOrderStatusSchema>,
    @CurrentAdmin() session: AdminSession,
  ) {
    return this.orders.setStatus(id, body.status, body.note, session);
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
  proposeTheme(@Body(new ZodPipe(ThemeBriefSchema)) body: ThemeBrief) {
    return this.themes.propose(body.brief);
  }

  @Post('themes/:id/publish')
  @RequirePermission('themes')
  @HttpCode(200)
  publishTheme(@Param('id') id: string) {
    return this.themes.publish(id, true);
  }

  /** Takes a published theme back: no longer offered; books keep theirs, catalog books pick by age. */
  @Post('themes/:id/unpublish')
  @RequirePermission('themes')
  @HttpCode(200)
  unpublishTheme(@Param('id') id: string) {
    return this.themes.publish(id, false);
  }

  @Delete('themes/:id')
  @RequirePermission('themes')
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
  updateTemplate(
    @Param('slug') slug: string,
    @Body(new ZodPipe(UpdateTemplateSchema)) body: UpdateTemplate,
    @CurrentAdmin() session: AdminSession,
  ) {
    return this.admin.updateTemplate(slug, body, session);
  }

  /** Shows or hides the catalog book in one country (a country manager: one of theirs). */
  @Put('templates/:slug/visibility')
  @RequirePermission('catalog')
  setTemplateVisibility(
    @Param('slug') slug: string,
    @Body(new ZodPipe(TemplateVisibilitySchema)) body: TemplateVisibility,
    @CurrentAdmin() session: AdminSession,
  ) {
    return this.admin.setVisibility(slug, body.country, body.visible, session);
  }

  /** Sets or clears a sample: global (global staff) or one country's (a country manager: theirs). */
  @Put('templates/:slug/samples')
  @RequirePermission('catalog')
  setTemplateSample(
    @Param('slug') slug: string,
    @Body(new ZodPipe(TemplateSampleSchema)) body: TemplateSample,
    @CurrentAdmin() session: AdminSession,
  ) {
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
  createMethodology(
    @Body(new ZodPipe(CreateMethodologySchema)) body: CreateMethodology,
  ) {
    return this.methodologies.create(body);
  }

  @Put('methodologies/:slug')
  @RequirePermission('methodologies')
  updateMethodology(
    @Param('slug') slug: string,
    @Body(new ZodPipe(UpdateMethodologySchema)) body: UpdateMethodology,
  ) {
    return this.methodologies.update(slug, body);
  }

  /** 409 methodology_in_use while catalog books or books follow it: unpublish it instead. */
  @Delete('methodologies/:slug')
  @RequirePermission('methodologies')
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
  async setPrices(
    @Body(new ZodPipe(PricesSchema)) body: Prices,
    @CurrentAdmin() session: AdminSession,
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
    if (!code) return this.reference.setPrices(body);
    return (await this.reference.setCountryPrices(code, body))[code];
  }

  /** The country is priced from the global list again. */
  @Delete('reference/prices')
  @RequirePermission('reference.prices')
  @HttpCode(204)
  async clearCountryPrices(
    @CurrentAdmin() session: AdminSession,
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
    await this.reference.setCountryPrices(code, null);
  }

  /** One country's landing overrides (hero, FAQ, sections): reference.landing in that country. */
  @Put('reference/landing')
  @RequirePermission('reference.landing')
  async setLanding(
    @Body(new ZodPipe(CountryLandingSchema)) body: CountryLanding,
    @CurrentAdmin() session: AdminSession,
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
    return (await this.reference.setLanding(code, body))[code];
  }

  /** The country's landing shows the defaults again. */
  @Delete('reference/landing')
  @RequirePermission('reference.landing')
  @HttpCode(204)
  async clearLanding(
    @CurrentAdmin() session: AdminSession,
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
    await this.reference.setLanding(code, null);
  }

  /**
   * Delivery cities: one country's (?country=XX: reference.cities there), or the whole list of every
   * country (global staff). Ids stay as they are: orders refer to them.
   */
  @Put('reference/cities')
  @RequirePermission('reference.cities')
  async setCities(
    @Body() body: unknown,
    @CurrentAdmin() session: AdminSession,
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
    if (!code) return this.reference.setCities(parseBody(CitiesSchema, body));
    return this.reference.setCountryCities(
      code,
      parseBody(CountryCitiesSchema, body),
    );
  }

  /**
   * The delivery fee: one country's own fee and free-delivery rule (?country=XX:
   * reference.delivery there), or the global fee countries without one pay (global staff).
   */
  @Put('reference/delivery')
  @RequirePermission('reference.delivery')
  async setDelivery(
    @Body(new ZodPipe(CountryDeliverySchema)) body: CountryDelivery,
    @CurrentAdmin() session: AdminSession,
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
    if (!code) {
      const prices = await this.reference.setDeliveryFee(body.feeKzt);
      return { feeKzt: prices.deliveryKzt, freeEverywhere: false };
    }
    return (await this.reference.setCountryDelivery(code, body))[code];
  }

  /** The country pays the global delivery fee again. */
  @Delete('reference/delivery')
  @RequirePermission('reference.delivery')
  @HttpCode(204)
  async clearDelivery(
    @CurrentAdmin() session: AdminSession,
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
    await this.reference.setCountryDelivery(code, null);
  }

  /**
   * One country's print formats: which are offered there and their cover prices
   * (reference.formats_country there). Sizes and ids stay global (PUT reference/formats).
   */
  @Put('reference/country-formats')
  @RequirePermission('reference.formats_country')
  async setCountryFormats(
    @Body(new ZodPipe(CountryFormatOverridesSchema))
    body: CountryFormatOverrides,
    @CurrentAdmin() session: AdminSession,
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
    return (await this.reference.setCountryFormats(code, body))[code];
  }

  /** The country offers and prices formats as globally again. */
  @Delete('reference/country-formats')
  @RequirePermission('reference.formats_country')
  @HttpCode(204)
  async clearCountryFormats(
    @CurrentAdmin() session: AdminSession,
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
    await this.reference.setCountryFormats(code, null);
  }

  /**
   * The countries the site offers. 400 country_policy_blocked for a code on Meta's list,
   * country_blocked for one the owner blocked.
   */
  @Put('reference/countries')
  @RequirePermission('reference')
  setCountries(@Body(new ZodPipe(CountriesSchema)) body: CountryEntry[]) {
    return this.reference.setCountries(body);
  }

  /** The landing's questions, in order; drafts (published: false) stay off the site. */
  @Put('reference/faq')
  @RequirePermission('reference')
  setFaq(@Body(new ZodPipe(FaqSchema)) body: FaqItem[]) {
    return this.reference.setFaq(body);
  }

  /** Print formats in the order form's order: sizes, bleed, safe zone and prices by cover (tenge). */
  @Put('reference/formats')
  @RequirePermission('reference')
  setFormats(@Body(new ZodPipe(FormatsSchema)) body: PrintFormat[]) {
    return this.reference.setFormats(body);
  }

  /** 400 country_policy_blocked for a code on Meta's list: that list cannot be edited here. */
  @Put('reference/blocked')
  @RequirePermission('reference')
  setBlocked(@Body(new ZodPipe(UpdateBlockedSchema)) body: UpdateBlocked) {
    return this.reference.setExtraBlocked(body.extra);
  }
}
