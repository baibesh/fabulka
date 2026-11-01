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
  JournalCallsQuerySchema,
  JournalPeriodQuerySchema,
  MethodologyPreviewSchema,
  PauseSchema,
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
  type Prices,
  type UpdateBlocked,
  type UpdateBook,
  type UpdateMethodology,
  type UpdateTemplate,
} from '@fabulka/shared';
import type { Response } from 'express';
import type { z } from 'zod';
import { AuthService } from '../auth/auth.service';
import { CurrentClient, type Client } from '../common/client';
import { ZodPipe } from '../common/zod.pipe';
import { JournalAdminService } from '../journal/journal-admin.service';
import { MethodologiesService } from '../methodologies/methodologies.service';
import { OrdersService } from '../orders/orders.service';
import { ReferenceService } from '../reference/reference.service';
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
    private readonly orders: OrdersService,
    private readonly journal: JournalAdminService,
    private readonly methodologies: MethodologiesService,
    private readonly reference: ReferenceService,
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

  @Delete('books/:id')
  @HttpCode(204)
  deleteBook(@Param('id') id: string) {
    return this.admin.deleteBook(id);
  }

  @Get('orders')
  listOrders() {
    return this.orders.list();
  }

  @Patch('orders/:id')
  setOrderStatus(
    @Param('id') id: string,
    @Body(new ZodPipe(UpdateOrderStatusSchema))
    body: z.infer<typeof UpdateOrderStatusSchema>,
  ) {
    return this.orders.setStatus(id, body.status);
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

  /** 400 country_policy_blocked for a code on Meta's list: that list cannot be edited here. */
  @Put('reference/blocked')
  setBlocked(@Body(new ZodPipe(UpdateBlockedSchema)) body: UpdateBlocked) {
    return this.reference.setExtraBlocked(body.extra);
  }
}
