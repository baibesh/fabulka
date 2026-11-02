import {
  Controller,
  Get,
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { resolve } from 'node:path';
import { AdminAuthService } from './admin/admin-auth.service';
import { AdminAuthController, AdminController } from './admin/admin.controller';
import { AdminService } from './admin/admin.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { SessionMiddleware } from './auth/current-user';
import { BooksController } from './books/books.controller';
import { BooksService } from './books/books.service';
import { ExamplesAdminController } from './examples/examples.controller';
import { ExamplesService } from './examples/examples.service';
import { TranslatorService } from './examples/translator.service';
import { GeoController } from './geo/geo.controller';
import { GeoGuard } from './geo/geo.guard';
import { GeoService } from './geo/geo.service';
import { JournalAdminService } from './journal/journal-admin.service';
import { JournalModule } from './journal/journal.service';
import { TelemetryController } from './journal/telemetry.controller';
import { MailService } from './mail/mail.service';
import { TestMailsController } from './mail/test-mails.controller';
import { MetaModule } from './meta/meta.module';
import { MethodologiesController } from './methodologies/methodologies.controller';
import { MethodologiesService } from './methodologies/methodologies.service';
import { OrdersController } from './orders/orders.controller';
import { SitemapController } from './sitemap/sitemap.controller';
import {
  SeoAdminController,
  SeoController,
  TestIndexNowController,
} from './seo/seo.controller';
import { SeoWebService } from './seo/seo-web.service';
import { SeoService } from './seo/seo.service';
import { OrdersService } from './orders/orders.service';
import { PdfModule } from './pdf/pdf.service';
import { PrismaModule } from './prisma/prisma.service';
import { QuotaController } from './quota/quota.controller';
import { QuotaService } from './quota/quota.service';
import { ReferenceController } from './reference/reference.controller';
import { ReferenceService } from './reference/reference.service';
import { SettingsService } from './settings/settings.service';
import { StatusController } from './settings/status.controller';
import { StorageModule } from './storage/storage.service';
import { TemplatesController } from './templates/templates.controller';
import { ToysController, ToyUploadsCleaner } from './toy/toys.controller';
import { TemplatesService } from './templates/templates.service';
import { ThemesController } from './themes/themes.controller';
import { ThemesService } from './themes/themes.service';
import { VoiceController } from './voice/voice.controller';
import { VoiceService } from './voice/voice.service';

@Controller('health')
class HealthController {
  @Get()
  health() {
    return { ok: true };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ServeStaticModule.forRoot({
      rootPath: resolve(process.env.STORAGE_DIR ?? './storage'),
      serveRoot: '/files',
      serveStaticOptions: { fallthrough: false },
    }),
    PrismaModule,
    StorageModule,
    PdfModule,
    JournalModule,
    MetaModule,
  ],
  controllers: [
    HealthController,
    BooksController,
    QuotaController,
    OrdersController,
    TemplatesController,
    ThemesController,
    MethodologiesController,
    ReferenceController,
    GeoController,
    StatusController,
    ToysController,
    AdminAuthController,
    AdminController,
    ExamplesAdminController,
    AuthController,
    TestMailsController,
    VoiceController,
    TelemetryController,
    SitemapController,
    SeoController,
    SeoAdminController,
    TestIndexNowController,
  ],
  providers: [
    ReferenceService,
    GeoService,
    { provide: APP_GUARD, useClass: GeoGuard },
    BooksService,
    QuotaService,
    OrdersService,
    TemplatesService,
    ThemesService,
    MethodologiesService,
    SettingsService,
    ToyUploadsCleaner,
    AdminAuthService,
    AdminService,
    JournalAdminService,
    AuthService,
    MailService,
    VoiceService,
    SeoService,
    SeoWebService,
    ExamplesService,
    TranslatorService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SessionMiddleware).forRoutes('*path');
  }
}
