"use client";

import { useQuery } from "@tanstack/react-query";
import { OTHER_COUNTRY } from "@fabulka/shared";
import { adminReference } from "@/lib/admin-api";
import { QUERY as REFERENCE_QUERY } from "./reference/shared";
import { useAdminI18n } from "./ui";
import { useCan } from "./working-country";

/**
 * Whether the site no longer offers a country code that staff, examples or catalog books still hold
 * (it left the list: its visitors get what "other" gets). False until the list is known, and for
 * sessions that may not read it.
 */
export function useNotOffered(): (code: string) => boolean {
  // The rights GET /admin/reference answers to.
  const may = useCan("reference", "reference.prices", "reference.landing", "reference.cities", "reference.delivery", "reference.formats_country", "catalog", "methodologies");
  const reference = useQuery({ queryKey: REFERENCE_QUERY, queryFn: adminReference, enabled: may });
  const listed = reference.data ? new Set(reference.data.countries.map((c) => c.code)) : null;
  return (code) => listed !== null && code !== OTHER_COUNTRY && !listed.has(code);
}

/** A small mark beside such a code: the data keeps it, the site shows its visitors the defaults. */
export function NotOffered({ code }: { code: string }) {
  const { t } = useAdminI18n();
  const notOffered = useNotOffered();
  if (!notOffered(code)) return null;
  return (
    <span data-testid="country-not-offered" data-code={code} title={t("admin.country.notOffered.hint")} className="text-[11px] font-semibold text-warning">
      {t("admin.country.notOffered")}
    </span>
  );
}
