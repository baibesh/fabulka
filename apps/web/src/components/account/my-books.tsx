"use client";

import { useQuery } from "@/lib/query";
import { BookOpen, LogIn, UserRound } from "lucide-react";
import { LocaleLink } from "@/i18n/routing";
import { intlLocale } from "@/i18n/format";
import { useI18n } from "@/i18n/i18n";
import { listMyBooks } from "@/lib/api";
import { loginUrl, useMe } from "@/lib/auth";
import { EmptyState } from "../ui/empty-state";
import { QueryState } from "../ui/query-state";
import { Skeleton } from "../ui/skeleton";
import { buttonClass } from "../ui/button";

export function MyBooks() {
  const { t, locale } = useI18n();
  const books = useQuery({ queryKey: ["my-books"], queryFn: listMyBooks, refetchInterval: 5000 });

  if (!books.data) return <QueryState error={books.error} />;
  if (!books.data.length) {
    return (
      <EmptyState
        data-testid="my-books-empty"
        icon={<BookOpen className="size-10 text-accent" />}
        title={t("my.empty.title")}
        action={
          <LocaleLink href="/catalog" className={buttonClass()}>
            {t("my.empty.cta")}
          </LocaleLink>
        }
      >
        {t("my.empty.text")}
      </EmptyState>
    );
  }
  return (
    <ul data-testid="my-books" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {books.data.map((book) => (
        <li key={book.id}>
          <LocaleLink href={`/books/${book.id}`} className="flex gap-4 rounded-2xl border border-border bg-card p-4 transition hover:border-accent">
            {book.heroImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- generated files, served by the API
              <img src={book.heroImageUrl} alt="" className="size-20 shrink-0 rounded-xl bg-white object-contain" />
            ) : (
              <Skeleton as="div" radius="md" className="size-20 shrink-0" />
            )}
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate font-bold">{book.title ?? book.childName}</span>
              <span className="text-sm text-muted">{book.status === "done" ? t("my.status.done") : book.status === "failed" ? t("my.status.failed") : t("my.status.working")}</span>
              <span className="text-xs text-muted">{new Date(book.createdAt).toLocaleDateString(intlLocale(locale))}</span>
            </div>
          </LocaleLink>
        </li>
      ))}
    </ul>
  );
}

/** Where the books live: the account once signed in, else a hint that signing in keeps them everywhere. */
export function MyAccountNote() {
  const { t, locale } = useI18n();
  const me = useMe();
  if (!me.data?.enabled) return null;
  const user = me.data.user;
  if (user) {
    return (
      <p data-testid="my-account" className="flex items-center gap-2 text-muted">
        <UserRound className="size-4 shrink-0 text-accent" />
        <span className="min-w-0 truncate">{t("my.account", { email: user.email ?? user.name ?? "" })}</span>
      </p>
    );
  }
  return (
    <p data-testid="my-signin" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
      {t("my.signin")}
      <a href={loginUrl("/my", locale)} className="flex items-center gap-1 font-semibold text-accent">
        <LogIn className="size-4" />
        {t("auth.login")}
      </a>
    </p>
  );
}
