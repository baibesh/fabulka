"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { MODEL_CALL_KINDS, type JournalPeriod, type ModelCallKind, type ModelCallStatus } from "@fabulka/shared";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { ErrorText } from "@/components/ui/notice";
import { Table, TableEmpty, TableFrame } from "@/components/ui/table";
import { journalCalls } from "@/lib/admin-api";
import { Card, formatSpendUsd, useAdminI18n } from "../ui";
import { CallDetail } from "./call-detail";
import { CallStatus, useUsage } from "./call-status";
import { useAdminHref } from "../working-country";

/** Every model call of the period, newest first, filtered by kind and outcome; a row opens its details. */
export function Calls({ period }: { period: JournalPeriod }) {
  const adminHref = useAdminHref();
  const { t, date, ms } = useAdminI18n();
  const usage = useUsage();
  const [kind, setKind] = useState<ModelCallKind | "">("");
  const [status, setStatus] = useState<ModelCallStatus | "">("");
  const [open, setOpen] = useState<string | null>(null);
  const calls = useInfiniteQuery({
    queryKey: ["admin", "journal", "calls", period, kind, status],
    queryFn: ({ pageParam }) => journalCalls({ period, kind: kind || undefined, status: status || undefined, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = calls.data?.pages.flatMap((page) => page.calls);

  return (
    <Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-bold">{t("admin.journal.requests")}</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select
            data-testid="journal-filter-kind"
            aria-label={t("admin.journal.kind")}
            className="sm:w-48"
            value={kind}
            onChange={(e) => setKind(e.target.value as ModelCallKind | "")}
          >
            <option value="">{t("admin.journal.allKinds")}</option>
            {MODEL_CALL_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`admin.journal.kind.${k}`)}
              </option>
            ))}
          </Select>
          <Select
            data-testid="journal-filter-status"
            aria-label={t("admin.journal.status")}
            className="sm:w-36"
            value={status}
            onChange={(e) => setStatus(e.target.value as ModelCallStatus | "")}
          >
            <option value="">{t("admin.journal.all")}</option>
            <option value="ok">{t("admin.journal.ok")}</option>
            <option value="error">{t("admin.journal.failed")}</option>
          </Select>
        </div>
      </div>
      {calls.isError && <ErrorText>{calls.error.message}</ErrorText>}
      <TableFrame flush>
        <Table data-testid="journal-calls">
          <thead>
            <tr>
              <th>{t("admin.journal.time")}</th>
              <th>{t("admin.journal.kind")}</th>
              <th>{t("admin.journal.status")}</th>
              <th className="text-right">{t("admin.journal.duration")}</th>
              <th className="text-right">{t("admin.journal.tokens")}</th>
              <th className="text-right">{t("admin.journal.price")}</th>
              <th>{t("admin.journal.book")}</th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((call) => (
              <tr
                key={call.id}
                data-testid="journal-call-row"
                data-kind={call.kind}
                data-status={call.status}
                tabIndex={0}
                onClick={() => setOpen(call.id)}
                onKeyDown={(e) => e.key === "Enter" && setOpen(call.id)}
                className="cursor-pointer hover:bg-background/60"
              >
                <td className="whitespace-nowrap text-muted">{date(call.createdAt)}</td>
                <td>
                  <span className="font-semibold whitespace-nowrap">{t(`admin.journal.kind.${call.kind}`)}</span>
                  <div className="text-xs text-muted">
                    {call.model}
                    {call.attempt > 1 && ` · ${t("admin.attempt", { n: call.attempt })}`}
                  </div>
                </td>
                <td>
                  <CallStatus status={call.status} />
                  {call.errorCode && <div className="text-xs text-danger">{call.errorCode}</div>}
                </td>
                <td className="text-right tabular-nums">{ms(call.latencyMs)}</td>
                <td className="text-right whitespace-nowrap tabular-nums text-muted">{usage(call)}</td>
                <td className="text-right tabular-nums">{formatSpendUsd(call.costUsd)}</td>
                <td>
                  {call.bookId ? (
                    <Link href={adminHref(`/admin/books/${call.bookId}`)} onClick={(e) => e.stopPropagation()} className="font-semibold text-accent">
                      {t("admin.journal.open")}
                    </Link>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
            {rows?.length === 0 && <TableEmpty colSpan={7}>{t("admin.journal.noCalls")}</TableEmpty>}
          </tbody>
        </Table>
      </TableFrame>
      {calls.hasNextPage && (
        <Button variant="secondary" data-testid="journal-more" disabled={calls.isFetchingNextPage} onClick={() => void calls.fetchNextPage()} className="self-center">
          {calls.isFetchingNextPage ? t("admin.loading") : t("admin.journal.more")}
        </Button>
      )}
      {open && <CallDetail id={open} onClose={() => setOpen(null)} />}
    </Card>
  );
}
