"use client";

import { isOutdatedError } from "@/lib/outdated";
import { ErrorNotice, OutdatedNotice } from "./error-notice";
import { useI18n } from "@/i18n/i18n";
import { cx } from "./cx";
import { ErrorText } from "./notice";

/**
 * What a page shows before its data: the error if the request failed (on the site, a visitor from a
 * restricted country gets the explanation), else «Загружаем…». Use as the early return:
 *
 *   if (!book.data) return <QueryState error={book.error} />;
 */
export function QueryState({ error, scope = "site", className }: { error: Error | null; scope?: "site" | "admin"; className?: string }) {
  const { t } = useI18n(scope);
  if (error && isOutdatedError(error)) return <OutdatedNotice error={error} className={className} />;
  if (error) return scope === "site" ? <ErrorNotice error={error} /> : <ErrorText className={className}>{error.message}</ErrorText>;
  return <p className={cx("text-muted", className)}>{t(scope === "admin" ? "admin.loading" : "common.loading")}</p>;
}
