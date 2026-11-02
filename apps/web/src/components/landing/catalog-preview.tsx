"use client";

import { LocaleLink } from "@/i18n/routing";
import { Catalog } from "@/components/catalog/catalog";
import { useI18n } from "@/i18n/i18n";
import { Section } from "./section";

/** The first catalog books and a story of your own, with a way to the whole catalog. */
export function CatalogPreview() {
  const { t } = useI18n();
  return (
    <Section testId="catalog-preview" title={t("landing.catalog.title")} lead={t("landing.catalog.lead")}>
      <Catalog preview />
      <LocaleLink href="/catalog" data-testid="all-catalog" className="self-center font-bold text-accent">
        {t("landing.catalog.all")} →
      </LocaleLink>
    </Section>
  );
}
