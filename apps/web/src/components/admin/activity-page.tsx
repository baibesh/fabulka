"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ADMIN_PERMISSIONS, AUDIT_ACTIONS, CurrencySchema, money, type AuditAction, type AuditEvent, type AuditQuery } from "@fabulka/shared";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { Flag } from "@/components/ui/flag";
import { Input, Select } from "@/components/ui/input";
import { ErrorText } from "@/components/ui/notice";
import { Table, TableEmpty, TableFrame } from "@/components/ui/table";
import { useCountryName } from "@/hooks/use-country-name";
import { activity, activityActors, activityCsvUrl } from "@/lib/admin-api";
import { Card, PageTitle, useAdminI18n } from "./ui";
import { useRightName } from "./team/shared";
import { useAdminHref, useWorkingCountry } from "./working-country";

const isAction = (code: string): code is AuditAction => (AUDIT_ACTIONS as readonly string[]).includes(code);

/** A stored value in a line: strings as they are, the rest as compact JSON, nothing as a dash. */
function show(value: unknown): string {
  if (value === undefined || value === null) return "—";
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** The text a few seconds after the last keystroke, so typing does not ask the API on each letter. */
function useSettled(value: string, ms = 300): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/**
 * «Activity»: who changed what in the admin, newest first. Filters by person, section, day range and
 * text; the country follows the working-country switcher (a country manager sees only their
 * countries' events). Each row reads in the admin's language from the event's codes and opens to the
 * changed values. The filtered list downloads as CSV.
 */
export function ActivityPage() {
  const { t } = useAdminI18n();
  const rightName = useRightName();
  const { country } = useWorkingCountry();
  const [actor, setActor] = useState("");
  const [section, setSection] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [text, setText] = useState("");
  const q = useSettled(text.trim());
  const filters: AuditQuery = {
    actor: actor || undefined,
    section: section || undefined,
    country: country ?? undefined,
    from: from || undefined,
    to: to || undefined,
    q: q || undefined,
  };
  const actors = useQuery({ queryKey: ["admin", "activity", "actors"], queryFn: activityActors });
  const events = useInfiniteQuery({
    queryKey: ["admin", "activity", filters],
    queryFn: ({ pageParam }) => activity({ ...filters, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = events.data?.pages.flatMap((page) => page.events);

  return (
    <>
      <PageTitle
        aside={
          <a href={activityCsvUrl(filters)} download data-testid="activity-csv" className={buttonClass({ variant: "secondary", size: "sm" })}>
            <Download className="size-4" />
            {t("admin.activity.csv")}
          </a>
        }
      >
        {t("admin.activity.title")}
      </PageTitle>
      <p className="max-w-3xl text-sm text-muted">{t("admin.activity.lead")}</p>
      <Card>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Select data-testid="activity-filter-person" aria-label={t("admin.activity.person")} value={actor} onChange={(e) => setActor(e.target.value)}>
            <option value="">{t("admin.activity.allPeople")}</option>
            {actors.data?.map((email) => (
              <option key={email} value={email}>
                {email}
              </option>
            ))}
          </Select>
          <Select data-testid="activity-filter-section" aria-label={t("admin.activity.section")} value={section} onChange={(e) => setSection(e.target.value)}>
            <option value="">{t("admin.activity.allSections")}</option>
            {ADMIN_PERMISSIONS.map((key) => (
              <option key={key} value={key}>
                {rightName(key)}
              </option>
            ))}
          </Select>
          <Input type="date" data-testid="activity-filter-from" aria-label={t("admin.activity.from")} value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" data-testid="activity-filter-to" aria-label={t("admin.activity.to")} value={to} onChange={(e) => setTo(e.target.value)} />
          <Input
            type="search"
            data-testid="activity-filter-text"
            aria-label={t("admin.activity.text")}
            placeholder={t("admin.activity.text")}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        {events.isError && <ErrorText>{events.error.message}</ErrorText>}
        <TableFrame flush>
          <Table data-testid="activity-table">
            <thead>
              <tr>
                <th />
                <th>{t("admin.activity.time")}</th>
                <th>{t("admin.activity.person")}</th>
                <th>{t("admin.activity.what")}</th>
                <th>{t("admin.activity.section")}</th>
                <th>{t("admin.activity.country")}</th>
              </tr>
            </thead>
            <tbody>
              {rows?.map((event) => <EventRow key={event.id} event={event} />)}
              {rows?.length === 0 && <TableEmpty colSpan={6}>{t("admin.activity.empty")}</TableEmpty>}
            </tbody>
          </Table>
        </TableFrame>
        {events.hasNextPage && (
          <Button variant="secondary" data-testid="activity-more" disabled={events.isFetchingNextPage} onClick={() => void events.fetchNextPage()} className="self-center">
            {events.isFetchingNextPage ? t("admin.loading") : t("admin.activity.more")}
          </Button>
        )}
      </Card>
    </>
  );
}

function EventRow({ event }: { event: AuditEvent }) {
  const { t, date } = useAdminI18n();
  const rightName = useRightName();
  const countryName = useCountryName("admin");
  const [open, setOpen] = useState(false);
  const action = isAction(event.action) ? event.action : "other";
  const section = (ADMIN_PERMISSIONS as readonly string[]).includes(event.section) ? rightName(event.section as (typeof ADMIN_PERMISSIONS)[number]) : event.section;
  return (
    <Fragment>
      <tr
        data-testid="activity-row"
        data-action={event.action}
        data-country={event.country ?? ""}
        data-actor={event.actorEmail ?? ""}
        data-target={event.targetId ?? ""}
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => e.key === "Enter" && setOpen(!open)}
        className="cursor-pointer hover:bg-background/60"
      >
        <td className="w-6 text-muted">{open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</td>
        <td className="whitespace-nowrap text-muted">{date(event.at)}</td>
        <td className="max-w-48 truncate" title={event.actorEmail ?? undefined}>
          {event.actorEmail ?? "—"}
        </td>
        <td>
          <span data-testid="activity-text" className="font-semibold">
            {t(`admin.activity.action.${action}`)}
          </span>
          {event.targetId && <code className="ml-2 text-xs text-muted">{event.targetId}</code>}
        </td>
        <td className="whitespace-nowrap text-sm">{section}</td>
        <td className="whitespace-nowrap">
          {event.country ? (
            <span className="flex items-center gap-1 text-sm" title={countryName(event.country)}>
              <Flag code={event.country} />
              {event.country}
            </span>
          ) : (
            <span className="text-sm text-muted">{t("admin.activity.global")}</span>
          )}
        </td>
      </tr>
      {open && (
        <tr data-testid="activity-details">
          <td />
          <td colSpan={5}>
            <Details event={event} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

/** What changed: each value before and after, or only the changed fields of a big change, then facts. */
function Details({ event }: { event: AuditEvent }) {
  const adminHref = useAdminHref();
  const { t, money: format } = useAdminI18n();
  const { changes, keys, data, truncated } = event.summary;
  // A price change names its currency: its amounts (minor units) read as money in it.
  const currency = CurrencySchema.safeParse(data?.currency).data;
  const showChange = (path: string, value: unknown) =>
    currency && typeof value === "number" && Number.isSafeInteger(value) && !path.includes("cost") && /(^|\.)(template|custom|fee|delivery|soft|hard)$/.test(path)
      ? format(money(value, currency))
      : show(value);
  const history = typeof data?.history === "string" ? data.history : null;
  const facts = Object.entries(data ?? {}).filter(([key]) => key !== "history");
  return (
    <div className="flex flex-col gap-3 py-2 text-sm">
      {changes && changes.length > 0 && (
        <div>
          <p className="mb-1 font-semibold">{t("admin.activity.changes")}</p>
          <ul data-testid="activity-changes" className="flex flex-col gap-0.5 font-mono text-xs">
            {changes.map((change) => (
              <li key={change.path} data-testid="activity-change" data-path={change.path}>
                <span className="text-muted">{change.path}:</span> <span className="text-danger line-through">{showChange(change.path, change.before)}</span> →{" "}
                <span className="text-success">{showChange(change.path, change.after)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {changes && changes.length === 0 && !keys && <p className="text-muted">{t("admin.activity.noChange")}</p>}
      {keys && keys.length > 0 && (
        <div>
          <p className="mb-1 font-semibold">{t("admin.activity.keys")}</p>
          <p data-testid="activity-keys" className="font-mono text-xs break-all">
            {keys.join(", ")}
          </p>
        </div>
      )}
      {facts.length > 0 && (
        <div>
          <p className="mb-1 font-semibold">{t("admin.activity.facts")}</p>
          <ul className="flex flex-col gap-0.5 font-mono text-xs">
            {facts.map(([key, value]) => (
              <li key={key} className="break-all">
                <span className="text-muted">{key}:</span> {show(value)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {truncated && <p className="text-xs text-muted">{t("admin.activity.truncated")}</p>}
      {history && (
        <Link href={adminHref("/admin/seo")} data-testid="activity-seo-history" className="self-start font-semibold text-accent hover:underline">
          {t("admin.activity.seoHistory")}
        </Link>
      )}
      <p className="text-xs text-muted">
        {[event.actorRoles.join(", "), event.ip, event.userAgent].filter(Boolean).join(" · ")}
      </p>
    </div>
  );
}
