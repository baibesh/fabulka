import { Controller, Get } from '@nestjs/common';
import type { SitemapEntries } from '@fabulka/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * What the site's sitemap.xml lists besides its fixed pages. Unlike GET /templates and GET
 * /books/examples it is not narrowed to a country: search engines should know every public page.
 */
@Controller('sitemap')
export class SitemapController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async entries(): Promise<SitemapEntries> {
    const [templates, examples] = await Promise.all([
      this.prisma.bookTemplate.findMany({
        where: { published: true },
        orderBy: { sortOrder: 'asc' },
        select: { slug: true, updatedAt: true },
      }),
      this.prisma.book.findMany({
        where: { featured: true, status: 'done', title: { not: null } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, updatedAt: true },
      }),
    ]);
    return {
      templates: templates.map((t) => ({
        slug: t.slug,
        updatedAt: t.updatedAt.toISOString(),
      })),
      examples: examples.map((b) => ({
        id: b.id,
        updatedAt: b.updatedAt.toISOString(),
      })),
    };
  }
}
