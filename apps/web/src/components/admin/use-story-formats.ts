"use client";

import { useQuery } from "@tanstack/react-query";
import { storyFormatText } from "@fabulka/shared";
import { useI18n } from "@/i18n/i18n";
import { adminStoryFormats } from "@/lib/admin-api";

/** Every story format, drafts too, as the admin's pages list them (methods pick from it). */
export function useAdminStoryFormats() {
  return useQuery({ queryKey: ["admin", "story-formats"], queryFn: adminStoryFormats });
}

/** A format's name by slug in the admin's language; the slug itself until the list arrives. */
export function useStoryFormatName(): (slug: string) => string {
  const { data } = useAdminStoryFormats();
  const { locale } = useI18n("admin");
  return (slug) => {
    const texts = data?.find((f) => f.slug === slug)?.texts;
    return (texts && storyFormatText(texts, locale).name) || slug;
  };
}
