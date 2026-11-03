"use client";

import { RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { useI18n } from "@/i18n/i18n";

/** The build this page was loaded from (next.config.ts); /version.json says the server's. */
const LOADED_BUILD = process.env.NEXT_PUBLIC_BUILD_ID;

/** How often an open page asks, besides whenever it comes back into view. */
const CHECK_EVERY_MS = 5 * 60_000;
/** Focus and visibility often fire together: at most one request per this long. */
const MIN_GAP_MS = 30_000;

/** The build the server runs now; null when it cannot say (offline, an error). */
async function serverBuild(): Promise<string | null> {
  try {
    const response = await fetch("/version.json", { cache: "no-store" });
    if (!response.ok) return null;
    const body = (await response.json()) as { buildId?: unknown };
    return typeof body.buildId === "string" && body.buildId ? body.buildId : null;
  } catch {
    return null;
  }
}

/** Reloads the page: the way out of a page older than the server. */
export function ReloadButton({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <Button size="sm" data-testid="reload-page" icon={<RefreshCw className="size-4" />} onClick={() => window.location.reload()} className={className}>
      {t("update.reload")}
    </Button>
  );
}

/**
 * A small notice when the server runs a newer build than this page (a deploy since it was opened):
 * an old bundle may misread the new API. Checked when the page comes back into view and every few
 * minutes. It only offers the reload, never does it on its own: the user may be halfway through a
 * form.
 */
export function NewVersionBanner() {
  const { t } = useI18n();
  const [outdated, setOutdated] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!LOADED_BUILD || outdated) return;
    let last = 0;
    let cancelled = false;
    const check = async () => {
      if (document.visibilityState !== "visible" || Date.now() - last < MIN_GAP_MS) return;
      last = Date.now();
      const build = await serverBuild();
      if (!cancelled && build && build !== LOADED_BUILD) setOutdated(true);
    };
    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [outdated]);

  if (!outdated || dismissed) return null;
  return (
    <Notice
      role="status"
      data-testid="new-version"
      tone="accent"
      size="sm"
      className="fixed inset-x-4 bottom-4 z-50 items-center shadow-lg sm:inset-x-auto sm:right-4 sm:max-w-sm"
      action={
        <button type="button" data-testid="new-version-dismiss" aria-label={t("update.dismiss")} onClick={() => setDismissed(true)} className="text-muted hover:text-foreground">
          <X className="size-4" />
        </button>
      }
    >
      <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span>{t("update.available")}</span>
        <ReloadButton />
      </span>
    </Notice>
  );
}
