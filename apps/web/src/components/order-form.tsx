"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CreateOrderSchema, type CreateOrderInput } from "@fabulka/shared";
import { Loader2, Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { createOrder, getBook } from "@/lib/api";
import { useI18n } from "@/i18n/i18n";
import { formatKzt } from "@/lib/format";
import { useMe } from "@/lib/auth";
import { useCities } from "@/lib/cities";
import { useOrderPrice, useReference } from "@/lib/use-price";
import { PriceSkeleton } from "./price-skeleton";

type FormValues = z.input<typeof CreateOrderSchema>;

const field = "w-full rounded-xl border border-border bg-card px-4 py-3 outline-none focus:border-accent";
const label = "flex flex-col gap-1.5 text-sm font-semibold";

export function OrderForm({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { t, locale } = useI18n();
  const book = useQuery({ queryKey: ["book", id], queryFn: () => getBook(id) });
  const form = useForm<FormValues, unknown, CreateOrderInput>({
    resolver: zodResolver(CreateOrderSchema),
    defaultValues: { bookId: id, recipientName: "", phone: "+7 ", email: "", city: "Алматы", address: "", cover: "soft", quantity: 1 },
  });
  const errors = form.formState.errors;

  // Signed in: the account's email and name, unless the parent has typed them already.
  const user = useMe().data?.user;
  useEffect(() => {
    if (user?.email && !form.getValues("email")) form.setValue("email", user.email);
    if (user?.name && !form.getValues("recipientName")) form.setValue("recipientName", user.name);
  }, [user, form]);
  const [cover, quantity, city] = useWatch({ control: form.control, name: ["cover", "quantity", "city"] });
  // Shown for the parent to check; the API prices the order again from the same reference data.
  const reference = useReference();
  const cities = useCities();
  const price = useOrderPrice(cover, Number(quantity) || 1, city);
  // The owner may have taken the default city off the list: start from the first one listed then.
  useEffect(() => {
    if (cities.length && !cities.some((c) => c.ru === form.getValues("city"))) form.setValue("city", cities[0].ru);
  }, [cities, form]);

  const order = useMutation({
    mutationFn: createOrder,
    onSuccess: (created) => router.push(`/orders/${created.id}`),
  });

  return (
    <form data-testid="order-form" noValidate onSubmit={form.handleSubmit((values) => order.mutate({ ...values, locale }))} className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold">{t("order.title")}</h1>
        {book.data?.title && <p className="text-muted">«{book.data.title}»</p>}
      </header>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        {(["soft", "hard"] as const).map((value) => (
          <label key={value} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border bg-card p-4 has-[:checked]:border-accent">
            <input type="radio" value={value} data-testid={`cover-${value}`} {...form.register("cover")} />
            <span className="flex flex-col">
              <span className="font-bold">{t(value === "soft" ? "order.cover.soft" : "order.cover.hard")}</span>
              <span className="text-muted">{reference.data ? formatKzt(reference.data.prices.covers[value]) : <PriceSkeleton />}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="grid gap-5 rounded-3xl border border-border bg-card p-6 sm:grid-cols-2">
        <label className={label}>
          {t("order.recipient")}
          <input data-testid="recipient-name" className={field} placeholder={t("order.recipient.placeholder")} {...form.register("recipientName")} />
          {errors.recipientName && <span className="text-red-600">{t("order.recipient.error")}</span>}
        </label>
        <label className={label}>
          {t("order.phone")}
          <input data-testid="phone" className={field} inputMode="tel" {...form.register("phone")} />
          {errors.phone && <span className="text-red-600">{t("order.phone.error")}</span>}
        </label>
        <label className={`${label} sm:col-span-2`}>
          {t("order.email")}
          <input
            data-testid="order-email"
            type="email"
            autoComplete="email"
            className={field}
            placeholder={t("order.email.placeholder")}
            {...form.register("email")}
          />
          {errors.email && <span className="text-red-600">{t("order.email.error")}</span>}
        </label>
        <label className={label}>
          {t("order.city")}
          <select data-testid="city" className={field} {...form.register("city")} value={city}>
            {cities.map((city) => (
              <option key={city.ru} value={city.ru}>
                {city[locale]}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          {t("order.quantity")}
          <select data-testid="quantity" className={field} {...form.register("quantity")}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className={`${label} sm:col-span-2`}>
          {t("order.address")}
          <input data-testid="address" className={field} placeholder={t("order.address.placeholder")} {...form.register("address")} />
          {errors.address && <span className="text-red-600">{t("order.address.error")}</span>}
        </label>
      </div>

      <section data-testid="order-summary" className="flex flex-col gap-1 rounded-2xl bg-card p-5">
        <div className="flex justify-between">
          <span>{t("order.books")}</span>
          <span>{price ? formatKzt(price.books) : <PriceSkeleton />}</span>
        </div>
        <div className="flex justify-between">
          <span>{t("order.delivery")}</span>
          <span>{price ? (price.delivery ? formatKzt(price.delivery) : t("order.free")) : <PriceSkeleton />}</span>
        </div>
        <div className="flex justify-between text-lg font-extrabold">
          <span>{t("order.total")}</span>
          <span data-testid="order-total">{price ? formatKzt(price.total) : <PriceSkeleton className="w-20" />}</span>
        </div>
      </section>

      <button
        type="submit"
        data-testid="place-order"
        disabled={order.isPending || !price}
        className="flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-4 text-lg font-bold text-accent-foreground disabled:opacity-60"
      >
        {order.isPending ? <Loader2 className="size-5 animate-spin" /> : <Printer className="size-5" />}
        {t("order.submit")}
      </button>
      <p className="text-center text-xs text-muted">{t("order.demo")}</p>
      {order.isError && (
        <p role="alert" className="text-red-600">
          {t("order.error", { message: order.error.message })}
        </p>
      )}
    </form>
  );
}
