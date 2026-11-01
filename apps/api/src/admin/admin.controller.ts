import {
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
  UpdateBookSchema,
  UpdateMethodologySchema,
  UpdateOrderStatusSchema,
  UpdateTemplateSchema,
  type AdminLogin,
  type AdminLoginOptions,
  type City,
  type CountryEntry,
  type CreateMethodology,
  type FaqItem,
  type JournalCallsQuery,
  type MethodologyPreview,
  type PinLayout,
  type Prices,
  type PrintFormat,
  type UpdateBlocked,
  type UpdateBook,
  type UpdateMethodology,
  type UpdateTemplate,
} from '@fabulka/shared';
import type { Response } from 'express';
import type { z } from 'zod';
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
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

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

  @Get('me')
  me() {
    return { ok: true };
  }

  @Get('stats')
  stats() {
    return this.admin.stats();
  }

  @Post('pause')
  @HttpCode(204)
  pause(@Body(new ZodPipe(PauseSchema)) body: z.infer<typeof PauseSchema>) {
    return this.admin.setPaused(body.paused);
  }

  @Get('books')
  books(@Query('status') status?: string) {
    return this.admin.listBooks(status);
  }

  @Get('books/:id')
  book(@Param('id') id: string) {
    return this.admin.book(id);
  }

  /** The book's model calls in order: the timeline on its admin page. */
  @Get('books/:id/calls')
  bookCalls(@Param('id') id: string) {
    return this.journal.bookCalls(id);
  }

  @Patch('books/:id')
  updateBook(
    @Param('id') id: string,
    @Body(new ZodPipe(UpdateBookSchema)) body: UpdateBook,
  ) {
    return this.admin.setFeatured(id, body.featured);
  }

  /** Staff pin a page's layout or change the theme; the book is re-rendered and re-checked. */
  @Patch('books/:id/layout')
  async pinLayout(
    @Param('id') id: string,
    @Body(new ZodPipe(PinLayoutSchema)) body: PinLayout,
  ) {
    await this.bookService.pinLayout(id, body);
    return this.admin.book(id);
  }

  @Delete('books/:id')
  @HttpCode(204)
  deleteBook(@Param('id') id: string) {
    return this.admin.deleteBook(id);
  }

  @Get('orders')
  listOrders() {
    return this.orders.list();
  }

  /** The order's print file: its frozen layout with bleed and crop marks (made on first request). */
  @Get('orders/:id/print.pdf')
  async printFile(
    @Param('id') id: string,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.orders.printFile(id);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.name}"`,
    );
    response.sendFile(file.path, { root: this.storage.root });
  }

  @Patch('orders/:id')
  setOrderStatus(
    @Param('id') id: string,
    @Body(new ZodPipe(UpdateOrderStatusSchema))
    body: z.infer<typeof UpdateOrderStatusSchema>,
  ) {
    return this.orders.setStatus(id, body.status, body.note);
  }

  @Get('journal/stats')
  journalStats(
    @Query(new ZodPipe(JournalPeriodQuerySchema))
    query: z.infer<typeof JournalPeriodQuerySchema>,
  ) {
    return this.journal.stats(query.period);
  }

  @Get('journal/calls')
  journalCalls(
    @Query(new ZodPipe(JournalCallsQuerySchema)) query: JournalCallsQuery,
  ) {
    return this.journal.calls(query);
  }

  @Get('journal/calls/:id')
  journalCall(@Param('id') id: string) {
    return this.journal.call(id);
  }

  @Get('journal/errors')
  journalErrors(
    @Query(new ZodPipe(JournalPeriodQuerySchema))
    query: z.infer<typeof JournalPeriodQuerySchema>,
  ) {
    return this.journal.errors(query.period);
  }

  /** Curated themes (read-only) and the ones Muse Spark proposed, with their checks and previews. */
  @Get('themes')
  listThemes() {
    return this.themes.adminList();
  }

  /**
   * Muse Spark proposes a theme for the owner's brief; it is checked (fonts, contrast, sizes,
   * glyphs, a sample book in every language) and stored as a draft. 422 theme_refused with the checks
   * when one fails.
   */
  @Post('themes')
  proposeTheme(@Body(new ZodPipe(ThemeBriefSchema)) body: ThemeBrief) {
    return this.themes.propose(body.brief);
  }

  @Post('themes/:id/publish')
  @HttpCode(200)
  publishTheme(@Param('id') id: string) {
    return this.themes.publish(id, true);
  }

  /** Takes a published theme back: no longer offered; books keep theirs, catalog books pick by age. */
  @Post('themes/:id/unpublish')
  @HttpCode(200)
  unpublishTheme(@Param('id') id: string) {
    return this.themes.publish(id, false);
  }

  @Delete('themes/:id')
  @HttpCode(204)
  deleteTheme(@Param('id') id: string) {
    return this.themes.remove(id);
  }

  @Get('templates')
  templates() {
    return this.admin.listTemplates();
  }

  @Get('templates/:slug')
  template(@Param('slug') slug: string) {
    return this.admin.template(slug);
  }

  @Patch('templates/:slug')
  updateTemplate(
    @Param('slug') slug: string,
    @Body(new ZodPipe(UpdateTemplateSchema)) body: UpdateTemplate,
  ) {
    return this.admin.updateTemplate(slug, body);
  }

  @Get('methodologies')
  listMethodologies() {
    return this.methodologies.adminList();
  }

  /** The method part of the story prompt for a sample child, from the editor's unsaved fields. */
  @Post('methodologies/preview')
  @HttpCode(200)
  previewMethodology(
    @Body(new ZodPipe(MethodologyPreviewSchema)) body: MethodologyPreview,
  ) {
    return this.methodologies.preview(body);
  }

  @Get('methodologies/:slug')
  methodology(@Param('slug') slug: string) {
    return this.methodologies.adminGet(slug);
  }

  @Post('methodologies')
  createMethodology(
    @Body(new ZodPipe(CreateMethodologySchema)) body: CreateMethodology,
  ) {
    return this.methodologies.create(body);
  }

  @Put('methodologies/:slug')
  updateMethodology(
    @Param('slug') slug: string,
    @Body(new ZodPipe(UpdateMethodologySchema)) body: UpdateMethodology,
  ) {
    return this.methodologies.update(slug, body);
  }

  /** 409 methodology_in_use while catalog books or books follow it: unpublish it instead. */
  @Delete('methodologies/:slug')
  @HttpCode(204)
  deleteMethodology(@Param('slug') slug: string) {
    return this.methodologies.remove(slug);
  }

  /** Prices, delivery cities and blocked countries (Meta's, read-only, and the owner's). */
  @Get('reference')
  referenceData() {
    return this.reference.admin();
  }

  @Put('reference/prices')
  setPrices(@Body(new ZodPipe(PricesSchema)) body: Prices) {
    return this.reference.setPrices(body);
  }

  @Put('reference/cities')
  setCities(@Body(new ZodPipe(CitiesSchema)) body: City[]) {
    return this.reference.setCities(body);
  }

  /**
   * The countries the site offers. 400 country_policy_blocked for a code on Meta's list,
   * country_blocked for one the owner blocked.
   */
  @Put('reference/countries')
  setCountries(@Body(new ZodPipe(CountriesSchema)) body: CountryEntry[]) {
    return this.reference.setCountries(body);
  }

  /** The landing's questions, in order; drafts (published: false) stay off the site. */
  @Put('reference/faq')
  setFaq(@Body(new ZodPipe(FaqSchema)) body: FaqItem[]) {
    return this.reference.setFaq(body);
  }

  /** Print formats in the order form's order: sizes, bleed, safe zone and prices by cover (tenge). */
  @Put('reference/formats')
  setFormats(@Body(new ZodPipe(FormatsSchema)) body: PrintFormat[]) {
    return this.reference.setFormats(body);
  }

  /** 400 country_policy_blocked for a code on Meta's list: that list cannot be edited here. */
  @Put('reference/blocked')
  setBlocked(@Body(new ZodPipe(UpdateBlockedSchema)) body: UpdateBlocked) {
    return this.reference.setExtraBlocked(body.extra);
  }
}
