"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Dialog } from "@/components/ui/dialog";
import { Notice } from "@/components/ui/notice";
import { QueryState } from "@/components/ui/query-state";
import { journalCall } from "@/lib/admin-api";
import { formatSpendUsd, useAdminI18n } from "../ui";
import { CallStatus, useUsage } from "./call-status";
import { useAdminHref } from "../working-country";

/** One call in full, in a side sheet: the error and, for a failed call, what was sent and what came back. */
export function CallDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const adminHref = useAdminHref();
  const { t, date, ms } = useAdminI18n();
  const usage = useUsage();
  const call = useQuery({ queryKey: ["admin", "journal", "call", id], queryFn: () => journalCall(id) });
  const c = call.data;
  return (
    <Dialog
      open
      onClose={onClose}
      variant="sheet"
      testId="journal-call-detail"
      title={c ? t(`admin.journal.kind.${c.kind}`) : t("admin.journal.call")}
      closeLabel={t("admin.close")}
    >
      {!c && <QueryState error={call.error} scope="admin" />}
      {c && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <CallStatus status={c.status} />
            {c.attempt > 1 && <span className="text-sm text-muted">{t("admin.attempt", { n: c.attempt })}</span>}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {(
              [
                [t("admin.journal.time"), date(c.createdAt)],
                [t("admin.journal.model"), c.model],
                [t("admin.journal.duration"), ms(c.latencyMs)],
                [t("admin.journal.usage"), usage(c)],
                [t("admin.journal.cost"), formatSpendUsd(c.costUsd)],
                [t("admin.journal.response"), c.responseId ?? "-"],
                [t("admin.journal.referenceIds"), c.references.length ? c.references.join(", ") : "-"],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted">{label}</dt>
                <dd className="break-all">{value}</dd>
              </div>
            ))}
            <dt className="text-muted">{t("admin.journal.book")}</dt>
            <dd>
              {c.bookId ? (
                <Link href={adminHref(`/admin/books/${c.bookId}`)} className="font-semibold text-accent">
                  {c.bookTitle ?? t("admin.untitled")}
                </Link>
              ) : (
                "-"
              )}
            </dd>
          </dl>
          {c.errorMessage && (
            <Notice as="p" role="alert" tone="danger" className="break-words">
              {c.errorCode && <span className="font-bold">{c.errorCode}: </span>}
              {c.errorMessage}
            </Notice>
          )}
          {[
            [t("admin.journal.prompt"), c.prompt],
            [t("admin.journal.output"), c.output],
          ].map(
            ([label, text]) =>
              text && (
                <div key={label} className="flex flex-col gap-1">
                  <p className="text-sm font-semibold">{label}</p>
                  <pre className="max-h-80 overflow-auto rounded-xl bg-background p-3 text-xs whitespace-pre-wrap">{text}</pre>
                </div>
              ),
          )}
          {c.status === "error" && !c.prompt && !c.output && <p className="text-xs text-muted">{t("admin.journal.noPrompt")}</p>}
        </>
      )}
    </Dialog>
  );
}
