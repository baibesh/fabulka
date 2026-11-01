import { Injectable } from '@nestjs/common';
import {
  BOOK_THEMES,
  SELECTABLE_THEMES,
  type BookTheme,
  type Language,
} from '@fabulka/shared';

/**
 * The themes books can be laid out in: the curated ones in code. Staff and parents pick among the
 * selectable ones (never the legacy look); a theme is offered only for languages its fonts cover.
 */
@Injectable()
export class ThemesService {
  /** Themes staff and parents may pick, covering every one of `languages` when given. */
  selectable(languages: readonly Language[] = []): Promise<BookTheme[]> {
    return Promise.resolve(
      SELECTABLE_THEMES.map((id) => BOOK_THEMES[id]).filter((theme) =>
        languages.every((l) => theme.languages.includes(l)),
      ),
    );
  }

  /** A selectable theme by id that covers `language`, or null. */
  async pick(id: string, language?: Language): Promise<BookTheme | null> {
    const themes = await this.selectable(language ? [language] : []);
    return themes.find((t) => t.id === id) ?? null;
  }
}
