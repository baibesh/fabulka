import { Controller, Get } from '@nestjs/common';
import type { SitemapEntries } from '@fabulka/shared';
import { ExamplesService } from '../examples/examples.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

/**
 * What the site's sitemap.xml lists besides its fixed pages. Unlike GET /templates and GET
 * /books/examples it is not narrowed to a country: search engines should know every public page.
 * An example's version is a page in its own language, with the story's other versions as alternates.
 */
@Controller('sitemap')
export class SitemapController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly examples: ExamplesService,
  ) {}

  @Get()
  async entries(): Promise<SitemapEntries> {
    const [templates, examples] = await Promise.all([
      this.prisma.bookTemplate.findMany({
        where: { published: true },
        orderBy: { sortOrder: 'asc' },
        select: { slug: true, updatedAt: true },
      }),
      this.examples.publicVersions(),
    ]);
    return {
      templates: templates.map((t) => ({
        slug: t.slug,
        updatedAt: t.updatedAt.toISOString(),
      })),
      examples: examples.map((b) => ({
        id: b.id,
        updatedAt: b.updatedAt.toISOString(),
        title: b.title,
        heroImageUrl: this.storage.url(b.heroImagePath),
        language: b.language,
        versions: b.versions,
      })),
    };
  }
}
