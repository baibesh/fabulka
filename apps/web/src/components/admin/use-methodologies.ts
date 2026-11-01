"use client";

import { useQuery } from "@tanstack/react-query";
import { methodologyText } from "@fabulka/shared";
import { useI18n } from "@/i18n/i18n";
import { adminMethodologies } from "@/lib/admin-api";

/** Every method, drafts too, as the admin's pages list them. */
export function useAdminMethodologies() {
  return useQuery({ queryKey: ["admin", "methodologies"], queryFn: adminMethodologies });
}

/**
 * A method's name by slug in the admin's language (Russian, then English, where that one is not filled in yet); the
 * slug itself until the list arrives or for a deleted one.
 */
export function useMethodologyName(): (slug: string) => string {
  const { data } = useAdminMethodologies();
  const { locale } = useI18n("admin");
  return (slug) => {
    const texts = data?.find((m) => m.slug === slug)?.texts;
    return (texts && methodologyText(texts, locale).name) || slug;
  };
}
