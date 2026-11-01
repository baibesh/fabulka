import { Controller, Get } from '@nestjs/common';
import type { BookTheme } from '@fabulka/shared';
import { ThemesService } from './themes.service';

@Controller('themes')
export class ThemesController {
  constructor(private readonly themes: ThemesService) {}

  /** Themes a parent may switch a book to: the curated ones and the AI ones staff published. */
  @Get()
  list(): Promise<BookTheme[]> {
    return this.themes.selectable();
  }
}
