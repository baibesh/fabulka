"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { adminBook, bookCalls, deleteBook, setFeatured } from "@/lib/admin-api";
import { CALL_KIND, CallDetail, CallStatus, formatMs } from "./journal";
import { Badge, BOOK_STATUS, Card, formatDate, formatUsd, ghostButton, PageTitle } from "./ui";
import { useMethodologyName } from "./use-methodologies";

/** The book's model calls in order, timed from the first: where generation spent its time and money. */
function BookCalls({ id, generating }: { id: string; generating: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const calls = useQuery({ queryKey: ["admin", "book", id, "calls"], queryFn: () => bookCalls(id), refetchInterval: generating ? 3000 : false });
  const start = calls.data?.[0] ? new Date(calls.data[0].createdAt).getTime() : 0;
  return (
    <Card title="Запросы к моделям">
      {calls.isError && <p role="alert" className="text-red-600">{calls.error.message}</p>}
      <ol data-testid="book-calls" className="flex flex-col text-sm">
        {calls.data?.map((call) => (
          <li key={call.id} className="border-t border-border first:border-t-0">
            <button type="button" onClick={() => setOpen(call.id)} className="grid w-full grid-cols-[3.5rem_1fr_auto] items-center gap-3 py-2 text-left hover:bg-background/60 sm:grid-cols-[3.5rem_1fr_auto_5rem_4.5rem]">
              <span className="tabular-nums text-muted">+{((new Date(call.createdAt).getTime() - start) / 1000).toFixed(1)} с</span>
              <span className="min-w-0">
                <span className="font-semibold">{CALL_KIND[call.kind]}</span>
                {call.attempt > 1 && <span className="text-muted"> · попытка {call.attempt}</span>}
                {call.errorMessage && <span className="block truncate text-xs text-red-600">{call.errorMessage}</span>}
              </span>
              <CallStatus status={call.status} />
              <span className="hidden text-right tabular-nums sm:block">{formatMs(call.latencyMs)}</span>
              <span className="hidden text-right tabular-nums text-muted sm:block">{formatUsd(call.costUsd)}</span>
            </button>
          </li>
        ))}
        {calls.data?.length === 0 && <li className="py-4 text-muted">Запросов нет: книга создана до журнала или ещё в очереди</li>}
      </ol>
      {open && <CallDetail id={open} onClose={() => setOpen(null)} />}
    </Card>
  );
}

export function BookDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const book = useQuery({ queryKey: ["admin", "book", id], queryFn: () => adminBook(id) });
  const methodName = useMethodologyName();
  const remove = useMutation({ mutationFn: () => deleteBook(id), onSuccess: () => router.replace("/admin/books") });
  const queryClient = useQueryClient();
  const feature = useMutation({
    mutationFn: (featured: boolean) => setFeatured(id, featured),
    onSuccess: (updated) => queryClient.setQueryData(["admin", "book", id], updated),
  });

  if (book.isError) return <p role="alert" className="text-red-600">{book.error.message}</p>;
  if (!book.data) return <p className="text-muted">Загружаем…</p>;
  const b = book.data;
  const facts: [string, string][] = [
    ["Ребёнок", `${b.child.name}, ${b.child.age} лет, ${b.child.gender === "girl" ? "девочка" : "мальчик"}, ${b.child.city}`],
    ["Увлечения", b.child.interests.join(", ")],
    ["Питомец", b.child.pet ?? "—"],
    ["Методика", methodName(b.methodology)],
    ["Книга каталога", b.template ?? "своя история"],
    ["Тема", b.theme ?? "—"],
    ["Язык", b.language.toUpperCase()],
    ["Страна", b.country ?? "—"],
    ["Расход моделей", formatUsd(b.costUsd)],
    ["Создана", formatDate(b.createdAt)],
  ];

  return (
    <>
      <Link href="/admin/books" className="text-sm font-semibold text-accent">
        ← Все книги
      </Link>
      <PageTitle
        aside={
          <div className="flex flex-wrap gap-2">
            <Link href={`/books/${b.id}`} target="_blank" className={`${ghostButton} flex items-center gap-2`}>
              <ExternalLink className="size-4" />
              Открыть
            </Link>
            {/* Only a finished book goes on the home page; one already there can always come off. */}
            {(b.status === "done" || b.featured) && (
              <button
                type="button"
                data-testid="feature-toggle"
                data-featured={b.featured}
                disabled={feature.isPending}
                onClick={() => feature.mutate(!b.featured)}
                className={`${ghostButton} flex items-center gap-2 ${b.featured ? "border-accent text-accent" : ""}`}
              >
                <Star className={`size-4 ${b.featured ? "fill-current" : ""}`} />
                {b.featured ? "В примерах — убрать" : "Показывать в примерах"}
              </button>
            )}
            {b.pdfUrl && (
              <a href={b.pdfUrl} download className={`${ghostButton} flex items-center gap-2`}>
                <Download className="size-4" />
                PDF для типографии
              </a>
            )}
            <button
              type="button"
              data-testid="delete-book"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm("Удалить книгу, её файлы и заказы? Это нельзя отменить.")) remove.mutate();
              }}
              className={`${ghostButton} flex items-center gap-2 text-red-600`}
            >
              <Trash2 className="size-4" />
              Удалить
            </button>
          </div>
        }
      >
        {b.title ?? "Без названия"}
      </PageTitle>
      <div>
        <Badge tone={BOOK_STATUS[b.status].tone}>{BOOK_STATUS[b.status].label}</Badge>
        {b.demo && <span className="ml-2 text-sm text-muted">создана по демо-коду</span>}
        {b.featured && <span className="ml-2 text-sm text-muted">показывается на главной в примерах</span>}
      </div>
      {feature.isError && <p role="alert" className="text-red-600">{feature.error.message}</p>}
      {b.error && <p role="alert" className="rounded-xl bg-red-500/10 p-4 text-sm text-red-600">{b.error}</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <Card title="Данные">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {facts.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {b.answers && Object.keys(b.answers).length > 0 && (
            <div className="flex flex-col gap-1 text-sm">
              <p className="font-semibold">Ответы родителя</p>
              {Object.entries(b.answers).map(([key, value]) => (
                <p key={key}>
                  <span className="text-muted">{key}:</span> {value}
                </p>
              ))}
            </div>
          )}
        </Card>
        <Card title="Страницы">
          <ol className="grid gap-4 sm:grid-cols-2">
            {b.pages.map((page) => (
              <li key={page.page} className="overflow-hidden rounded-xl border border-border">
                {page.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- generated files, served by the API
                  <img src={page.imageUrl} alt="" className="aspect-[3/2] w-full object-cover" />
                ) : (
                  <div className="aspect-[3/2] w-full bg-border" />
                )}
                <p className="p-3 text-sm">{page.text}</p>
              </li>
            ))}
          </ol>
        </Card>
      </div>
      <BookCalls id={b.id} generating={b.status !== "done" && b.status !== "failed"} />
    </>
  );
}
