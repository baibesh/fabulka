"use client";

import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/i18n/i18n";
import { listMethodologies } from "./api";

/** The published story methods in the interface language; they change only when the admin edits them. */
export function useMethodologies() {
  const { locale } = useI18n();
  return useQuery({
    queryKey: ["methodologies", locale],
    queryFn: () => listMethodologies(locale),
    staleTime: 5 * 60_000,
  });
}
