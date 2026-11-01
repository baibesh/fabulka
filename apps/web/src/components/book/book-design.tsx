"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SELECTABLE_THEMES, availableVariants, planBook, type Book, type UpdateLayout } from "@fabulka/shared";
import { Palette } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import { updateLayout } from "@/lib/api";
import { Card } from "../ui/card";
import { ErrorText } from "../ui/notice";
import { SectionHeader } from "../ui/section-header";
import { Spinner } from "../ui/spinner";

/**
 * Before ordering, the parent may pick another theme, and for each page one of the 2–3 layouts
 * that suit its picture. Only the layout changes: the API re-renders the book (and its PDF) and
 * the reader shows the new pages.
 */
export function BookDesign({ book }: { book: Book }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (patch: UpdateLayout) => updateLayout(book.id, patch),
    onSuccess: (updated) => queryClient.setQueryData(["book", book.id], updated),
  });
  const current = book.layout.theme.id;
  // Pages with a real choice: the layouts that suit the picture and fit where the page falls.
  const pages = planBook(book, book.layout)
    .filter((p) => p.kind === "story" && p.part === 0)
    .map((p) => ({ page: p.story!, variant: p.variant!, options: availableVariants(book.layout.theme, book.layout.pages[String(p.story)], p.index) }))
    .filter((p) => p.options.length > 1);

  return (
    <Card data-testid="book-design" data-theme={current} aria-busy={save.isPending} className="flex flex-col gap-4">
      <SectionHeader size="md" icon={<Palette className="size-5 text-accent" />} title={t("design.title")} lead={t("design.hint")} />
      <div role="group" aria-label={t("design.theme")} className="grid gap-2 sm:grid-cols-3">
        {SELECTABLE_THEMES.map((id) => (
          <button
            key={id}
            type="button"
            data-testid={`theme-${id}`}
            aria-pressed={current === id}
            disabled={save.isPending}
            onClick={() => current !== id && save.mutate({ theme: id })}
            className="flex flex-col gap-0.5 rounded-xl border border-border bg-card px-3 py-2 text-left transition hover:border-accent disabled:opacity-60 aria-pressed:border-accent aria-pressed:ring-2 aria-pressed:ring-accent/30"
          >
            <span className="font-bold">{t(`design.theme.${id}`)}</span>
            <span className="text-xs text-muted">{t(`design.theme.${id}.note`)}</span>
          </button>
        ))}
      </div>
      {pages.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-bold">{t("design.pages")}</h3>
          <ul className="flex flex-col gap-2">
            {pages.map(({ page, variant, options }) => (
              <li key={page} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-24 shrink-0 text-muted">{t("design.page", { page })}</span>
                {options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    data-testid={`variant-${page}-${option}`}
                    aria-pressed={variant === option}
                    disabled={save.isPending}
                    onClick={() => variant !== option && save.mutate({ choices: { [String(page)]: option } })}
                    className="rounded-full border border-border px-3 py-1 transition hover:border-accent disabled:opacity-60 aria-pressed:border-accent aria-pressed:bg-accent/10 aria-pressed:font-semibold"
                  >
                    {t(`design.variant.${option}`)}
                  </button>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}
      {save.isPending && (
        <p data-testid="design-saving" className="flex items-center gap-2 text-sm text-muted">
          <Spinner size="sm" />
          {t("design.saving")}
        </p>
      )}
      {save.isError && <ErrorText>{save.error.message}</ErrorText>}
    </Card>
  );
}
