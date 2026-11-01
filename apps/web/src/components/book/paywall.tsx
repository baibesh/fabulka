"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { EmailSchema, type BookKind } from "@fabulka/shared";
import { KeyRound, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { buyBook, setDemoCode } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { useI18n } from "@/i18n/i18n";
import { useBookPrice } from "@/lib/use-price";
import { PriceSkeleton } from "./price-skeleton";
import { ErrorText } from "../ui/notice";
import { Button } from "../ui/button";
import { Field } from "../ui/field";
import { Input } from "../ui/input";

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
      <Field label={t("paywall.email")} optional={t("common.optional")} error={!emailValid && t("order.email.error")}>
        <Input
          data-testid="paywall-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="name@mail.kz"
        />
      </Field>
      <Button
        data-testid="buy-book"
        loading={buy.isPending}
        disabled={!emailValid || !price}
        icon={<ShoppingBag className="size-5" />}
        onClick={() => buy.mutate()}
      >
        {price ? t("paywall.buy", { price }) : <PriceSkeleton className="w-40" />}
      </Button>
      {buy.isError && <ErrorText className="text-sm">{buy.error.message}</ErrorText>}
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
        <Input data-testid="demo-code" aria-label={t("paywall.code")} value={code} onChange={(event) => setCode(event.target.value)} placeholder={t("paywall.code")} />
        <Button type="submit" variant="secondary" data-testid="apply-demo-code" icon={<KeyRound className="size-4" />}>
          {t("paywall.apply")}
        </Button>
      </form>
    </section>
  );
}
