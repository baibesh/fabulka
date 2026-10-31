import { Controller, Get, Query } from '@nestjs/common';
import type { Methodology } from '@fabulka/shared';
import { language } from '../templates/templates.controller';
import { MethodologiesService } from './methodologies.service';

@Controller('methodologies')
export class MethodologiesController {
  constructor(private readonly methodologies: MethodologiesService) {}

  /** The published methods in the admin's order; ?lang=ru|kk|en picks the language of the texts. */
  @Get()
  list(@Query('lang') lang?: string): Promise<Methodology[]> {
    return this.methodologies.list(language(lang));
  }
}
