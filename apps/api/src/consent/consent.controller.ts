import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  DEFAULT_LANGUAGE,
  LanguageSchema,
  UpdateConsentSchema,
  type ConsentText,
  type UpdateConsent,
} from '@fabulka/shared';
import {
  AdminGuard,
  CurrentAdmin,
  RequirePermission,
} from '../admin/admin.guard';
import type { AdminSession } from '../admin/admin-auth.service';
import { Audit, AuditTrail, Trail } from '../audit/audit.interceptor';
import { ZodPipe } from '../common/zod.pipe';
import { ConsentService } from './consent.service';

/** The consent the wizard shows before a photo of the child is sent (the newest version). */
@Controller('consent')
export class ConsentController {
  constructor(private readonly consent: ConsentService) {}

  /** ?lang= the page's language (English when missing or unknown). */
  @Get('hero-photo')
  async heroPhoto(@Query('lang') lang?: string): Promise<ConsentText> {
    const language = LanguageSchema.safeParse(lang).data ?? DEFAULT_LANGUAGE;
    const { version, clauses, createdAt, ...current } =
      await this.consent.current(language);
    return { language: current.language, version, clauses, createdAt };
  }
}

/**
 * Admin «Consent» (Global settings): the clauses per language. A save makes a new version; books keep
 * the version their parent accepted. Every save goes into Activity.
 */
@Controller('admin/consent')
@UseGuards(AdminGuard)
export class ConsentAdminController {
  constructor(private readonly consent: ConsentService) {}

  @Get()
  @RequirePermission('consent')
  list() {
    return this.consent.admin();
  }

  @Put(':language')
  @RequirePermission('consent')
  @Audit('consent.update', { target: 'consent', param: 'language' })
  async save(
    @Param('language') lang: string,
    @Body(new ZodPipe(UpdateConsentSchema)) body: UpdateConsent,
    @CurrentAdmin() session: AdminSession,
    @Trail() trail: AuditTrail,
  ) {
    const language = LanguageSchema.safeParse(lang).data;
    if (!language) throw new BadRequestException('An unknown language');
    const { before, after, changed } = await this.consent.save(
      language,
      body.clauses,
      session.who,
    );
    if (!changed) trail.skip();
    else
      trail
        .target('consent', language)
        .in(null)
        .diff(before.clauses, after.clauses)
        .note({ language, version: after.version, previous: before.version });
    return after;
  }
}
