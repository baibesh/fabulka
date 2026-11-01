import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Room for a toy photo (POST /toys) and for the photo page's photo (POST /books/:id/photo):
  // up to 8 MB as base64, about 10.7 MB of JSON.
  app.useBodyParser('json', { limit: '12mb' });
  // /files (generated images) stays outside the /api prefix.
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 4000);
}
void bootstrap();
