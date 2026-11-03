"use client";

import { REGION_UNAVAILABLE } from "@fabulka/shared";
import { Globe } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import { ApiError } from "@/lib/api";
import { isOutdatedError } from "@/lib/outdated";
import { ReloadButton } from "../layout/new-version";
import { cx } from "./cx";
import { ErrorText } from "./notice";

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
  if (isOutdatedError(error)) return <OutdatedNotice error={error} />;
  return <ErrorText>{error.message}</ErrorText>;
}

/** A response this page could not read (it is older than the server): the sentence and a reload. */
export function OutdatedNotice({ error, className }: { error: Error; className?: string }) {
  return (
    <div role="alert" data-testid="page-outdated" className={cx("flex flex-wrap items-center gap-3", className)}>
      <span className="text-danger">{error.message}</span>
      <ReloadButton />
    </div>
  );
}
