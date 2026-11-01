import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Room for a toy photo (POST /toys) and for the photo page's photo (POST /books/:id/photo):
  // up to 7 MB as base64, about 9.4 MB of JSON (nginx allows 10 MB).
  app.useBodyParser('json', { limit: '12mb' });
  // /files (generated images) stays outside the /api prefix.
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 4000);
}
void bootstrap();
