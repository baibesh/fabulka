"use client";

import { useQuery } from "@tanstack/react-query";
import { BookOpen, LogIn, UserRound } from "lucide-react";
import Link from "next/link";
import { intlLocale } from "@/i18n/format";
import { useI18n } from "@/i18n/i18n";
import { listMyBooks } from "@/lib/api";
import { loginUrl, useMe } from "@/lib/auth";
import { ErrorNotice } from "./error-notice";

export function MyBooks() {
  const { t, locale } = useI18n();
  const books = useQuery({ queryKey: ["my-books"], queryFn: listMyBooks, refetchInterval: 5000 });

  if (books.error) return <ErrorNotice error={books.error} />;
  if (!books.data) return <p className="text-muted">{t("common.loading")}</p>;
  if (!books.data.length) {
    return (
      <div data-testid="my-books-empty" className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-border p-10 text-center">
        <BookOpen className="size-10 text-accent" />
        <p className="text-lg font-bold">{t("my.empty.title")}</p>
        <p className="text-muted">{t("my.empty.text")}</p>
        <Link href="/catalog" className="rounded-xl bg-accent px-5 py-3 font-bold text-accent-foreground">
          {t("my.empty.cta")}
        </Link>
      </div>
    );
  }
  return (
    <ul data-testid="my-books" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {books.data.map((book) => (
        <li key={book.id}>
          <Link href={`/books/${book.id}`} className="flex gap-4 rounded-2xl border border-border bg-card p-4 transition hover:border-accent">
            {book.heroImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- generated files, served by the API
              <img src={book.heroImageUrl} alt="" className="size-20 shrink-0 rounded-xl bg-white object-contain" />
            ) : (
              <div className="size-20 shrink-0 animate-pulse rounded-xl bg-border" />
            )}
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate font-bold">{book.title ?? book.childName}</span>
              <span className="text-sm text-muted">{book.status === "done" ? t("my.status.done") : book.status === "failed" ? t("my.status.failed") : t("my.status.working")}</span>
              <span className="text-xs text-muted">{new Date(book.createdAt).toLocaleDateString(intlLocale(locale))}</span>
            </div>
          </Link>
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
