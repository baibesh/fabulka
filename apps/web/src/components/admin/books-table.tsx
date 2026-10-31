"use client";

import { useQuery } from "@tanstack/react-query";
import { BOOK_STATUSES, type BookStatus } from "@fabulka/shared";
import Link from "next/link";
import { useState } from "react";
import { adminBooks } from "@/lib/admin-api";
import { Badge, BOOK_STATUS, formatDate, formatUsd, input, PageTitle, table } from "./ui";
import { useMethodologyName } from "./use-methodologies";

export function BooksTable() {
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
          <input
            data-testid="books-search"
            type="search"
            className={`${input} w-56`}
            placeholder="Название, имя или id"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select data-testid="books-filter" className={`${input} w-48`} value={status} onChange={(e) => setStatus(e.target.value as BookStatus | "")}>
            <option value="">Все статусы</option>
            {BOOK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {BOOK_STATUS[s].label}
              </option>
            ))}
          </select>
          </div>
        }
      >
        Книги
      </PageTitle>
      {books.isError && <p role="alert" className="text-red-600">{books.error.message}</p>}
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table data-testid="books-table" className={table}>
          <thead>
            <tr>
              <th>Книга</th>
              <th>Статус</th>
              <th>Методика</th>
              <th>Язык</th>
              <th>Страна</th>
              <th className="text-right">Расход</th>
              <th>Создана</th>
            </tr>
          </thead>
          <tbody>
            {visible?.map((book) => (
              <tr key={book.id} className="hover:bg-background/60">
                <td>
                  <Link href={`/admin/books/${book.id}`} className="font-semibold hover:text-accent">
                    {book.title ?? "Без названия"}
                  </Link>
                  <div className="text-xs text-muted">
                    {book.childName}
                    {book.template ? " · из каталога" : " · своя история"}
                    {book.demo && " · демо-код"}
                    {book.featured && " · в примерах"}
                    {book.orders > 0 && ` · заказов: ${book.orders}`}
                  </div>
                </td>
                <td>
                  <Badge tone={BOOK_STATUS[book.status].tone}>{BOOK_STATUS[book.status].label}</Badge>
                </td>
                <td className="text-muted">{methodName(book.methodology)}</td>
                <td className="uppercase text-muted">{book.language}</td>
                <td className="text-muted">{book.country ?? "—"}</td>
                <td className="text-right tabular-nums">{formatUsd(book.costUsd)}</td>
                <td className="whitespace-nowrap text-muted">{formatDate(book.createdAt)}</td>
              </tr>
            ))}
            {visible?.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted">
                  Книг нет
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
