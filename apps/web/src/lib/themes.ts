import { localized, type BookTheme, type Language } from "@fabulka/shared";
import type { MessageKey } from "@/i18n/messages";

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** A theme's name: a curated theme's from the messages, an AI theme's from the theme itself. */
export function themeName(theme: BookTheme, t: Translate, locale: Language): string {
  if (theme.source === "ai") return localized(theme.name ?? {}, locale) || theme.id;
  return t(`design.theme.${theme.id}` as MessageKey);
}

/** One line under the name: a curated theme's note, an AI theme's fonts. */
export function themeNote(theme: BookTheme, t: Translate): string {
  if (theme.source === "ai") return t("design.theme.ai.note", { body: theme.fonts.body.family, heading: theme.fonts.heading.family });
  return t(`design.theme.${theme.id}.note` as MessageKey);
}
