"use client";

import { useQuery } from "@tanstack/react-query";
import { adminMethodologies } from "@/lib/admin-api";

/** Every method, drafts too, as the admin's pages list them. */
export function useAdminMethodologies() {
  return useQuery({ queryKey: ["admin", "methodologies"], queryFn: adminMethodologies });
}

/** A method's Russian name by slug; the slug itself until the list arrives or for a deleted one. */
export function useMethodologyName(): (slug: string) => string {
  const { data } = useAdminMethodologies();
  return (slug) => data?.find((m) => m.slug === slug)?.texts.ru.name || slug;
}
