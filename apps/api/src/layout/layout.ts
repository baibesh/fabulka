import {
  BookLayoutSchema,
  legacyLayout,
  type BookLayout,
} from '@fabulka/shared';
import { missingGlyphs } from './fonts';

/** A book row's layout: the stored one, or the classic look for books made before themes. */
export function layoutOf(stored: unknown): BookLayout {
  const parsed = BookLayoutSchema.safeParse(stored);
  return parsed.success ? parsed.data : legacyLayout();
}

/**
 * Decorative heading fonts are used only when they have every letter of the title (a child's name
 * may bring one in); otherwise the whole title goes in the body font, never letter by letter.
 */
export function withHeadingCheck(
  layout: BookLayout,
  texts: string[],
): BookLayout {
  const missing = missingGlyphs(layout.theme.fonts.heading, texts.join(' '));
  return { ...layout, headingFallback: missing.length > 0 };
}
