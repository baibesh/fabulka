"use client";

import { useQuery } from "@/lib/query";
import { CloudUpload, LogIn } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/i18n";
import { listMyBooks } from "@/lib/api";
import { loginUrl, useMe } from "@/lib/auth";
import { Button, buttonClass } from "../ui/button";

/** "dismissed", or the id of the book the offer was first shown on. */
const PROMPT_KEY = "fabulka.savePrompt";

function readPrompt(): string | null {
  try {
    return localStorage.getItem(PROMPT_KEY);
  } catch {
    return null;
  }
}

function writePrompt(value: string) {
  try {
    localStorage.setItem(PROMPT_KEY, value);
  } catch {
    // Private mode: the offer may come back on the next visit.
  }
}

/**
 * After the visitor's first finished book: an optional offer to keep it in an account. Shown on
 * that book until dismissed, never on later ones, never to someone signed in.
 */
export function SavePrompt({ bookId }: { bookId: string }) {
  const { t, locale } = useI18n();
  const me = useMe();
  const signedOut = me.data?.enabled === true && !me.data.user;
  const books = useQuery({ queryKey: ["my-books"], queryFn: listMyBooks, enabled: signedOut });
  const [seen, setSeen] = useState(readPrompt);

  // Only on the visitor's own book (example books open on the same page).
  const own = books.data?.some((book) => book.id === bookId) ?? false;
  const firstBook = books.data?.filter((book) => book.status === "done").length === 1;
  const show = signedOut && own && seen !== "dismissed" && (seen ? seen === bookId : firstBook);

  // Remembers which book it was offered on, so it stays there and skips the later ones.
  useEffect(() => {
    if (show && !seen) writePrompt(bookId);
  }, [show, seen, bookId]);

  if (!show) return null;

  return (
    <section
      data-testid="save-prompt"
      className="flex flex-col gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-5 sm:flex-row sm:items-center"
    >
      <CloudUpload className="size-6 shrink-0 text-accent" />
      <p className="font-semibold sm:mr-auto">{t("auth.save.text")}</p>
      <div className="flex flex-wrap gap-2">
        <a
          href={loginUrl(`/books/${bookId}`, locale)}
          data-testid="save-prompt-login"
          className={buttonClass({ size: "sm" })}
        >
          <LogIn className="size-4" />
          {t("auth.save.login")}
        </a>
        <Button
          variant="secondary"
          size="sm"
          data-testid="save-prompt-dismiss"
          onClick={() => {
            writePrompt("dismissed");
            setSeen("dismissed");
          }}
          className="text-muted"
        >
          {t("auth.save.dismiss")}
        </Button>
      </div>
    </section>
  );
}
