"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { EmailSchema, type BookKind } from "@fabulka/shared";
import { KeyRound, Loader2, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { buyBook, setDemoCode } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { useI18n } from "@/i18n/i18n";
import { useBookPrice } from "@/lib/use-price";
import { PriceSkeleton } from "./price-skeleton";

/**
 * Shown when the free books are used up: the demo checkout for one more book of `kind` (a catalog
 * book costs less than a story of your own), or a demo code for judges.
 */
export function Paywall({ kind, onUnlocked }: { kind: BookKind; onUnlocked: () => void }) {
  const queryClient = useQueryClient();
  const { t, locale, info } = useI18n();
  const price = useBookPrice(kind);
  const [code, setCode] = useState("");
  // The receipt's address: optional, the account's email until the parent types another.
  const accountEmail = useMe().data?.user?.email;
  const [typed, setTyped] = useState<string | null>(null);
  const email = typed ?? accountEmail ?? "";
  const emailValid = !email.trim() || EmailSchema.safeParse(email).success;
  const unlocked = () => {
    void queryClient.invalidateQueries({ queryKey: ["quota"] });
    onUnlocked();
  };
  const buy = useMutation({
    mutationFn: () => buyBook({ kind, locale, ...(email.trim() ? { email: email.trim() } : {}) }),
    onSuccess: unlocked,
  });

  return (
    <section data-testid="paywall" className="flex flex-col gap-4 rounded-2xl border-2 border-accent bg-card p-5 sm:col-span-2">
      <div>
        <h2 className="text-lg font-extrabold">{t("paywall.title")}</h2>
        <p className="text-muted">{price ? t(info.print ? `paywall.text.${kind}` : `paywall.text.${kind}.pdf`, { price }) : <PriceSkeleton className="w-64 max-w-full" />}</p>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        <span>
          {t("paywall.email")} <span className="font-normal text-muted">{t("common.optional")}</span>
        </span>
        <input
          data-testid="paywall-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="name@mail.kz"
          aria-invalid={!emailValid}
          className="w-full rounded-xl border border-border bg-background px-4 py-2 font-normal aria-[invalid=true]:border-red-600"
        />
        {!emailValid && <span className="font-normal text-red-600">{t("order.email.error")}</span>}
      </label>
      <button
        type="button"
        data-testid="buy-book"
        disabled={buy.isPending || !emailValid || !price}
        onClick={() => buy.mutate()}
        className="flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 font-bold text-accent-foreground disabled:opacity-60"
      >
        {buy.isPending ? <Loader2 className="size-5 animate-spin" /> : <ShoppingBag className="size-5" />}
        {price ? t("paywall.buy", { price }) : <PriceSkeleton className="w-40" />}
      </button>
      {buy.isError && (
        <p role="alert" className="text-sm text-red-600">
          {buy.error.message}
        </p>
      )}
      <p className="text-xs text-muted">{t("paywall.demo")}</p>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!code.trim()) return;
          setDemoCode(code);
          unlocked();
        }}
      >
        <input
          data-testid="demo-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder={t("paywall.code")}
          className="w-full rounded-xl border border-border bg-background px-4 py-2"
        />
        <button type="submit" data-testid="apply-demo-code" className="flex items-center gap-1 rounded-xl border border-border px-4 font-semibold">
          <KeyRound className="size-4" /> {t("paywall.apply")}
        </button>
      </form>
    </section>
  );
}
