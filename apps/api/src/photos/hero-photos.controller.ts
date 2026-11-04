import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import {
  HERO_PHOTO_OFF,
  HERO_PHOTO_SIGN_IN,
  HeroPhotoIdSchema,
  HeroPhotoUploadSchema,
  heroPhotoOffered,
  type HeroPhotoUpload,
} from '@fabulka/shared';
import { AuthService } from '../auth/auth.service';
import { CurrentUser, type SessionUser } from '../auth/current-user';
import { CurrentClient, type Client } from '../common/client';
import { ZodPipe } from '../common/zod.pipe';
import { GeoService } from '../geo/geo.service';
import { ReferenceService } from '../reference/reference.service';
import { HeroPhotosService } from './hero-photos.service';

/**
 * Whether this visitor may use the photo path: signed in (401 hero_photo_sign_in) and in a country
 * where it is on (403 hero_photo_off). The visitor's country is the one chosen on the site, else the
 * IP's, as for prices.
 */
export async function assertHeroPhotoAllowed(
  user: SessionUser | null,
  client: Client,
  geo: GeoService,
  reference: ReferenceService,
): Promise<string> {
  if (!user)
    throw new UnauthorizedException({
      code: HERO_PHOTO_SIGN_IN,
      message: 'Sign in to draw the hero from a photo',
    });
  const country = await reference.visitorCountry(
    client.country,
    geo.country(client.ip),
  );
  if (!heroPhotoOffered(await reference.infoFor(country)))
    throw new ForbiddenException({
      code: HERO_PHOTO_OFF,
      message: 'Drawing the hero from a photo is not offered in your country',
    });
  return user.id;
}

@Controller('hero-photos')
export class HeroPhotosController {
  constructor(
    private readonly photos: HeroPhotosService,
    private readonly geo: GeoService,
    private readonly reference: ReferenceService,
  ) {}

  /**
   * The child's photo for the hero, with the consent the parent gave on the screen before (its
   * version and language; every checkbox ticked). Returns the upload id createBook takes.
   */
  @Post()
  async upload(
    @Body(new ZodPipe(HeroPhotoUploadSchema)) body: HeroPhotoUpload,
    @CurrentClient() client: Client,
    @CurrentUser() user: SessionUser | null,
  ): Promise<{ upload: string }> {
    const userId = await assertHeroPhotoAllowed(
      user,
      client,
      this.geo,
      this.reference,
    );
    return this.photos.upload(body, userId);
  }
}

/** For E2E flows only (AUTH_MOCK=true, never in production): whether a hero photo is still stored. */
@Controller('test/hero-photos')
export class TestHeroPhotosController {
  constructor(
    private readonly auth: AuthService,
    private readonly photos: HeroPhotosService,
  ) {}

  @Get(':upload')
  exists(@Param('upload') upload: string) {
    if (!this.auth.mock || !HeroPhotoIdSchema.safeParse(upload).success)
      throw new NotFoundException();
    return this.photos.exists(upload);
  }
}
