import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  LandingImageLanguageSchema,
  LandingImageSlotSchema,
  LandingImageUploadSchema,
  type CountryLanding,
  type LandingBook,
  type LandingImageUpload,
} from '@fabulka/shared';
import {
  AdminGuard,
  CurrentAdmin,
  RequirePermission,
} from '../admin/admin.guard';
import type { AdminSession } from '../admin/admin-auth.service';
import { assertScope } from '../admin/scope';
import { Audit, AuditTrail, Trail } from '../audit/audit.interceptor';
import { ZodPipe } from '../common/zod.pipe';
import { LandingImagesService } from './landing-images.service';

/** ?country= as an upper-case ISO code; 400 without one. */
function requiredCountry(value: string | undefined): string {
  const code = value?.trim().toUpperCase();
  if (!code || !/^[A-Z]{2}$/.test(code))
    throw new BadRequestException('?country= is required');
  return code;
}

/**
 * A country's landing pictures (admin Landing tab): reference.landing in that country, like the rest
 * of the country's landing. Each change is in the Activity log.
 */
@Controller('admin/reference/landing')
@UseGuards(AdminGuard)
export class LandingImagesController {
  constructor(private readonly images: LandingImagesService) {}

  /** Finished books to take a picture from: the examples and the country's (and global) samples. */
  @Get('books')
  @RequirePermission('reference.landing')
  books(
    @CurrentAdmin() session: AdminSession,
    @Query('country') country?: string,
  ): Promise<LandingBook[]> {
    const code = requiredCountry(country);
    assertScope(
      session,
      'reference.landing',
      [code],
      'Not one of your countries',
    );
    return this.images.books(code);
  }

  @Post('image')
  @RequirePermission('reference.landing')
  @Audit('landing.image', { target: 'landing' })
  async set(
    @Body(new ZodPipe(LandingImageUploadSchema)) body: LandingImageUpload,
    @CurrentAdmin() session: AdminSession,
    @Trail() trail: AuditTrail,
    @Query('country') country?: string,
  ): Promise<CountryLanding> {
    const code = requiredCountry(country);
    assertScope(
      session,
      'reference.landing',
      [code],
      'Not one of your countries',
    );
    const after = await this.images.set(code, body);
    trail
      .target('landing', code)
      .in(code)
      .note({
        slot: body.slot,
        language: body.language,
        source: body.book
          ? `book:${body.book.id}:${body.book.picture}`
          : 'upload',
        path: after.images?.[body.slot]?.[body.language]?.path ?? null,
      });
    return after;
  }

  @Delete('image')
  @RequirePermission('reference.landing')
  @Audit('landing.image_clear', { target: 'landing' })
  async remove(
    @CurrentAdmin() session: AdminSession,
    @Trail() trail: AuditTrail,
    @Query('country') country?: string,
    @Query('slot') slot?: string,
    @Query('language') language?: string,
  ): Promise<CountryLanding | null> {
    const code = requiredCountry(country);
    assertScope(
      session,
      'reference.landing',
      [code],
      'Not one of your countries',
    );
    const parsedSlot = LandingImageSlotSchema.safeParse(slot);
    const parsedLanguage = LandingImageLanguageSchema.safeParse(language);
    if (!parsedSlot.success || !parsedLanguage.success)
      throw new BadRequestException('?slot= and ?language= are required');
    trail
      .target('landing', code)
      .in(code)
      .note({ slot: parsedSlot.data, language: parsedLanguage.data });
    return this.images.remove(code, parsedSlot.data, parsedLanguage.data);
  }
}
