"use client";

import { useQuery } from "@/lib/query";
import { useI18n } from "@/i18n/i18n";
import { listExamples, listTemplates } from "./api";

/**
 * The catalog books listed in the visitor's country (the site's country picker), in the interface
 * language; switching the country or the language fetches the list again.
 */
export function useTemplates() {
  const { locale, country } = useI18n();
  return useQuery({ queryKey: ["templates", locale, country], queryFn: () => listTemplates(locale, country) });
}

/** The example books for the visitor's country: those from catalog books listed there, and stories of their own. */
export function useExamples() {
  const { country } = useI18n();
  return useQuery({ queryKey: ["examples", country], queryFn: () => listExamples(country) });
}
