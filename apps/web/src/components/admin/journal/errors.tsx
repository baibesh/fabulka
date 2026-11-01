"use client";

import { useQuery } from "@tanstack/react-query";
import type { ClientErrorGroup, JournalPeriod } from "@fabulka/shared";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryState } from "@/components/ui/query-state";
import { journalErrors } from "@/lib/admin-api";
import { useAdminI18n } from "../ui";

function ErrorRow({ group }: { group: ClientErrorGroup }) {
  const { t, date, number } = useAdminI18n();
  const [open, setOpen] = useState(false);
  return (
    <li data-testid="journal-error-row" className="border-t border-border first:border-t-0">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-background/60">
        <ChevronDown className={`mt-0.5 size-4 shrink-0 text-muted transition-transform ${open ? "" : "-rotate-90"}`} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-semibold break-words">{group.message}</span>
          <span className="text-xs text-muted">
            {group.path} · {t("admin.journal.lastSeen", { date: date(group.lastSeen) })}
          </span>
        </span>
        <Badge tone="danger" className="shrink-0 tabular-nums">
          {number(group.count)}
        </Badge>
      </button>
      {open && (
        <ul className="flex flex-col gap-2 px-5 pb-4 pl-12 text-xs text-muted">
          {group.recent.map((e) => (
            <li key={e.id} className="flex flex-col gap-0.5">
              <span className="text-foreground">
                {date(e.createdAt)} · {t(`admin.journal.errorKind.${e.kind}`)}
                {e.status !== null && ` · ${e.status}`}
                {e.code && ` · ${e.code}`}
                {e.locale && ` · ${e.locale}`}
              </span>
              {e.userAgent && <span className="break-all">{e.userAgent}</span>}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Errors visitors ran into, grouped by page and message, with the latest occurrences. */
export function Errors({ period }: { period: JournalPeriod }) {
  const { t } = useAdminI18n();
  const errors = useQuery({ queryKey: ["admin", "journal", "errors", period], queryFn: () => journalErrors(period), refetchInterval: 10_000 });
  return (
    <section data-testid="journal-errors" className="overflow-hidden rounded-2xl border border-border bg-card">
      {!errors.data && <QueryState error={errors.error} scope="admin" className="p-5" />}
      {errors.data?.length === 0 && <EmptyState variant="plain">{t("admin.journal.noErrors")}</EmptyState>}
      <ul>
        {errors.data?.map((group) => (
          <ErrorRow key={`${group.path}\n${group.message}`} group={group} />
        ))}
      </ul>
    </section>
  );
}
