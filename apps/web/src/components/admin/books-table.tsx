"use client";

import { useQuery } from "@tanstack/react-query";
import { BOOK_STATUSES, type BookStatus } from "@fabulka/shared";
import Link from "next/link";
import { useState } from "react";
import { adminBooks } from "@/lib/admin-api";
import { BOOK_STATUS_TONE, formatSpendUsd, PageTitle, useAdminI18n } from "./ui";
import { useMethodologyName } from "./use-methodologies";
import { Badge } from "@/components/ui/badge";
import { ErrorText } from "@/components/ui/notice";
import { Table, TableEmpty, TableFrame } from "@/components/ui/table";
import { Input, Select } from "@/components/ui/input";

export function BooksTable() {
  const { t, date, bookStatus } = useAdminI18n();
  const [status, setStatus] = useState<BookStatus | "">("");
  const [query, setQuery] = useState("");
  const books = useQuery({ queryKey: ["admin", "books", status], queryFn: () => adminBooks(status || undefined), refetchInterval: 5000 });
  const methodName = useMethodologyName();

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? books.data?.filter((b) => [b.title ?? "", b.childName, b.id].some((v) => v.toLowerCase().includes(needle)))
    : books.data;

  return (
    <>
      <PageTitle
        aside={
          <div className="flex flex-wrap gap-2">
            <Input
              data-testid="books-search"
              type="search"
              aria-label={t("admin.books.search")}
              className="w-56"
              placeholder={t("admin.books.search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Select data-testid="books-filter" aria-label={t("admin.books.status")} className="w-48" value={status} onChange={(e) => setStatus(e.target.value as BookStatus | "")}>
            <option value="">{t("admin.allStatuses")}</option>
            {BOOK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {bookStatus(s)}
              </option>
            ))}
            </Select>
          </div>
        }
      >
        {t("admin.books.title")}
      </PageTitle>
      {books.isError && <ErrorText>{books.error.message}</ErrorText>}
      <TableFrame>
        <Table data-testid="books-table">
          <thead>
            <tr>
              <th>{t("admin.books.book")}</th>
              <th>{t("admin.books.status")}</th>
              <th>{t("admin.books.method")}</th>
              <th>{t("admin.books.language")}</th>
              <th>{t("admin.books.country")}</th>
              <th className="text-right">{t("admin.books.spend")}</th>
              <th>{t("admin.books.created")}</th>
            </tr>
          </thead>
          <tbody>
            {visible?.map((book) => (
              <tr key={book.id} className="hover:bg-background/60">
                <td>
                  <Link href={`/admin/books/${book.id}`} className="font-semibold hover:text-accent">
                    {book.title ?? t("admin.untitled")}
                  </Link>
                  <div className="text-xs text-muted">
                    {[
                      book.childName,
                      book.template ? t("admin.books.fromCatalog") : t("admin.books.custom"),
                      book.demo && t("admin.books.demo"),
                      book.example && t("admin.books.example"),
                      book.orders > 0 && t("admin.books.orders", { count: book.orders }),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </td>
                <td>
                  <Badge tone={BOOK_STATUS_TONE[book.status]}>{bookStatus(book.status)}</Badge>
                </td>
                <td className="text-muted">{methodName(book.methodology)}</td>
                <td className="uppercase text-muted">{book.language}</td>
                <td className="text-muted">{book.country ?? "—"}</td>
                <td className="text-right tabular-nums">{formatSpendUsd(book.costUsd)}</td>
                <td className="whitespace-nowrap text-muted">{date(book.createdAt)}</td>
              </tr>
            ))}
            {visible?.length === 0 && <TableEmpty colSpan={7}>{t("admin.books.empty")}</TableEmpty>}
          </tbody>
        </Table>
      </TableFrame>
    </>
  );
}
