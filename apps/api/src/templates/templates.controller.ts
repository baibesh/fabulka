import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  LanguageSchema,
  type Template,
  type TemplateSummary,
} from '@fabulka/shared';
import { TemplatesService } from './templates.service';

@Controller('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  /** ?lang=ru|kk|en picks the interface language; anything else falls back to Russian. */
  @Get()
  list(@Query('lang') lang?: string): Promise<TemplateSummary[]> {
    return this.templates.list(language(lang));
  }

  @Get(':slug')
  get(
    @Param('slug') slug: string,
    @Query('lang') lang?: string,
  ): Promise<Template> {
    return this.templates.get(slug, language(lang));
  }
}

/** The interface language a ?lang= asks for; anything else falls back to Russian. */
export function language(lang: string | undefined) {
  const parsed = LanguageSchema.safeParse(lang);
  return parsed.success ? parsed.data : 'ru';
}
