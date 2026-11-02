import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  LanguageSchema,
  catalogCountry,
  type Template,
  type TemplateSummary,
} from '@fabulka/shared';
import { TemplatesService } from './templates.service';

@Controller('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  /**
   * ?lang= picks the interface language (anything else falls back to Russian); ?country= the
   * visitor's country on the site: the books listed there. "other", none or an unknown code get
   * only the books listed everywhere.
   */
  @Get()
  list(
    @Query('lang') lang?: string,
    @Query('country') country?: string,
  ): Promise<TemplateSummary[]> {
    return this.templates.list(language(lang), catalogCountry(country));
  }

  /** Any published book, wherever it is listed: a direct link opens it from every country. */
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
