import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  CreateBookSchema,
  GENERATION_PAUSED,
  OTHER_COUNTRY,
  type Book,
  type CreateBookInput,
  type ExampleBook,
  type MyBook,
  type PhotoUpload,
  PhotoUploadSchema,
  type UpdateLayout,
  UpdateLayoutSchema,
} from '@fabulka/shared';
import { CurrentUser, type SessionUser } from '../auth/current-user';
import { CurrentClient, type Client } from '../common/client';
import { ZodPipe } from '../common/zod.pipe';
import { GeoService } from '../geo/geo.service';
import { ReferenceService } from '../reference/reference.service';
import { QuotaService } from '../quota/quota.service';
import { SettingsService } from '../settings/settings.service';
import { BooksService } from './books.service';

@Controller('books')
export class BooksController {
  constructor(
    private readonly books: BooksService,
    private readonly quota: QuotaService,
    private readonly settings: SettingsService,
    private readonly geo: GeoService,
    private readonly reference: ReferenceService,
  ) {}

  @Post()
  async create(
    @Body(new ZodPipe(CreateBookSchema)) body: CreateBookInput,
    @CurrentClient() client: Client,
    @CurrentUser() user: SessionUser | null,
  ): Promise<Book> {
    if (await this.settings.paused()) {
      throw new HttpException(
        {
          code: GENERATION_PAUSED,
          message:
            'Создание книг временно приостановлено, загляните чуть позже',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    await this.quota.assertCanCreate(client.key, client.demoCode);
    return this.books.create(
      body,
      client.key,
      this.quota.isDemo(client.demoCode),
      this.geo.country(client.ip),
      user?.id ?? null,
    );
  }

  /** "My books": the signed-in parent's books plus this browser's anonymous ones. */
  @Get()
  mine(
    @CurrentClient() client: Client,
    @CurrentUser() user: SessionUser | null,
  ): Promise<MyBook[]> {
    return this.books.listMine(client.key, user?.id);
  }

  /** Books for every visitor to open; declared before :id so "examples" is not taken for an id. */
  @Get('examples')
  examples(): Promise<ExampleBook[]> {
    return this.books.listExamples();
  }

  /**
   * Someone in a country without print wants this book printed. Counted for the country they
   * chose on the site when it is a listed one, else for their IP's.
   */
  @Post(':id/print-interest')
  @HttpCode(204)
  async printInterest(
    @Param('id') id: string,
    @CurrentClient() client: Client,
  ): Promise<void> {
    const ip = this.geo.country(client.ip);
    const country = await this.reference.visitorCountry(client.country, ip);
    return this.books.recordPrintInterest(
      id,
      country === OTHER_COUNTRY ? ip : country,
    );
  }

  @Get(':id')
  get(
    @Param('id') id: string,
    @CurrentClient() client: Client,
    @CurrentUser() user: SessionUser | null,
  ): Promise<Book> {
    return this.books.get(id, client.key, user?.id);
  }

  /** The parent picks another theme or page layout before ordering; the book is re-rendered. */
  @Patch(':id/layout')
  updateLayout(
    @Param('id') id: string,
    @Body(new ZodPipe(UpdateLayoutSchema)) body: UpdateLayout,
    @CurrentClient() client: Client,
    @CurrentUser() user: SessionUser | null,
  ): Promise<Book> {
    return this.books.updateLayout(id, body, client.key, user?.id);
  }

  /**
   * The parent's photo of the child for the photo page (before ordering): JPEG, PNG or HEIC up to
   * 8 MB as a data URL; 400 photo_refused with a `reason` otherwise. To remove it, the parent takes
   * the photo page out (PATCH layout); its file is deleted.
   */
  @Post(':id/photo')
  uploadPhoto(
    @Param('id') id: string,
    @Body(new ZodPipe(PhotoUploadSchema)) body: PhotoUpload,
    @CurrentClient() client: Client,
    @CurrentUser() user: SessionUser | null,
  ): Promise<Book> {
    return this.books.uploadPhoto(id, body, client.key, user?.id);
  }
}
