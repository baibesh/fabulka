"use client";

import { REGION_UNAVAILABLE } from "@fabulka/shared";
import { Globe } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import { ApiError } from "@/lib/api";

/** An API error; visitors from a restricted country get an explanation instead of a raw message. */
export function ErrorNotice({ error }: { error: Error }) {
  const { t } = useI18n();
  if (error instanceof ApiError && error.code === REGION_UNAVAILABLE) {
    return (
      <section data-testid="region-unavailable" role="alert" className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-8 text-center">
        <Globe className="mx-auto size-10 text-accent" />
        <h2 className="text-2xl font-extrabold">{t("region.title")}</h2>
        <p className="text-muted">{t("region.text")}</p>
      </section>
    );
  }
  return (
    <p role="alert" className="text-danger">
      {error.message}
    </p>
  );
}
