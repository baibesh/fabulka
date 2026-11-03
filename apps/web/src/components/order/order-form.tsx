"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/query";
import { CreateOrderSchema, cityName, formatName, type Book, type CreateOrderInput } from "@fabulka/shared";
import { Printer } from "lucide-react";
import { useParams } from "next/navigation";
import { useLocaleRouter } from "@/i18n/routing";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { createOrder, getBook, updateLayout } from "@/lib/api";
import { useI18n } from "@/i18n/i18n";
import { useFormat } from "@/hooks/use-format";
import { useMe } from "@/lib/auth";
import { useCities } from "@/lib/cities";
import { useCountryFormats, useOrderPrice } from "@/lib/use-price";
import { PriceSkeleton } from "../book/price-skeleton";
import { BookPage, BookStyles, PX_PER_MM, useRenderedBook } from "../book/book-pages";
import { Spinner } from "../ui/spinner";
import { ErrorText } from "../ui/notice";
import { Button } from "../ui/button";
import { ChoiceCard, Radio } from "../ui/choice";
import { Field } from "../ui/field";
import { Input, Select } from "../ui/input";
import { Card } from "../ui/card";
import { PageHeader } from "../ui/page";

type FormValues = z.input<typeof CreateOrderSchema>;

/** Calling codes the phone field starts with, by country; elsewhere just "+". */
const CALLING_CODES: Record<string, string> = { KZ: "7", DE: "49", AT: "43", CH: "41", ES: "34", GB: "44", US: "1", CA: "1", PL: "48", CZ: "420" };
const phonePrefix = (country: string) => `+${CALLING_CODES[country] ?? ""}${CALLING_CODES[country] ? " " : ""}`;

export function OrderForm() {
  const { id } = useParams<{ id: string }>();
  const router = useLocaleRouter();
  const { t, locale, info, country } = useI18n();
  const { money } = useFormat();
  const book = useQuery({ queryKey: ["book", id], queryFn: () => getBook(id) });
  const form = useForm<FormValues, unknown, CreateOrderInput>({
    resolver: zodResolver(CreateOrderSchema),
    defaultValues: { bookId: id, recipientName: "", phone: phonePrefix(country), email: "", cityId: "almaty", address: "", cover: "soft", quantity: 1 },
  });
  const errors = form.formState.errors;

  // Signed in: the account's email and name, unless the parent has typed them already.
  const user = useMe().data?.user;
  useEffect(() => {
    if (user?.email && !form.getValues("email")) form.setValue("email", user.email);
    if (user?.name && !form.getValues("recipientName")) form.setValue("recipientName", user.name);
  }, [user, form]);
  const [cover, quantity, cityId] = useWatch({ control: form.control, name: ["cover", "quantity", "cityId"] });
  // Shown for the parent to check; the API prices the order again from the same reference data.
  // The visitor's country's cities and formats (offered there, at its prices).
  const cities = useCities();
  const formats = useCountryFormats();
  // The book's own format when it is offered, else the first offered one.
  const bookFormat = book.data?.layout.format.id;
  const format = formats.find((f) => f.id === bookFormat)?.id ?? formats[0]?.id;
  const price = useOrderPrice(id, format, cover, Number(quantity) || 1, cityId);
  // Another format lays the book out again at that size (the API re-renders it); the preview follows.
  const queryClient = useQueryClient();
  const reformat = useMutation({
    mutationFn: (next: string) => updateLayout(id, { format: next }),
    onSuccess: (updated) => queryClient.setQueryData(["book", id], updated),
  });
  // The owner may have taken the default city off the list: start from the first one listed then.
  useEffect(() => {
    if (cities.length && !cities.some((c) => c.id === form.getValues("cityId"))) form.setValue("cityId", cities[0].id);
  }, [cities, form]);

  const order = useMutation({
    mutationFn: createOrder,
    onSuccess: (created) => router.push(`/orders/${created.id}`),
  });

  // Print is offered only where the country has it, priced in its currency (the API refuses the rest).
  if (!info.print) {
    return (
      <Card data-testid="order-unavailable" radius="lg" padding="lg" className="flex flex-col gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold">
          <Printer className="size-6 text-accent" />
          {t("order.unavailable.title")}
        </h1>
        <p className="text-muted">{t("order.unavailable.text")}</p>
      </Card>
    );
  }

  return (
    <form
      data-testid="order-form"
      noValidate
      onSubmit={form.handleSubmit((values) => order.mutate({ ...values, format, locale }))}
      className="flex flex-col gap-6"
    >
      <PageHeader size="md" title={t("order.title")} lead={book.data?.title && `«${book.data.title}»`} />

      <div className="grid gap-4 md:grid-cols-[1fr_auto]">
        <fieldset data-testid="order-formats" aria-busy={reformat.isPending} className="flex flex-col gap-2">
          <legend className="mb-2 font-bold">{t("order.format")}</legend>
          {formats.map((f) => (
            <ChoiceCard
              key={f.id}
              data-testid={`format-${f.id}`}
              control={
                <Radio
                  name="format"
                  value={f.id}
                  checked={format === f.id}
                  disabled={reformat.isPending || !book.data}
                  onChange={() => format !== f.id && reformat.mutate(f.id)}
                />
              }
            >
              <span className="flex flex-1 flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-bold">{formatName(f, locale)}</span>
                <span className="text-sm text-muted">
                  {t("order.format.size", { width: f.widthMm / 10, height: f.heightMm / 10 })} · {money(f.prices[cover])}
                </span>
              </span>
            </ChoiceCard>
          ))}
          {reformat.isPending && (
            <p data-testid="format-saving" className="flex items-center gap-2 text-sm text-muted">
              <Spinner size="sm" />
              {t("design.saving")}
            </p>
          )}
          {reformat.isError && <ErrorText>{reformat.error.message}</ErrorText>}
        </fieldset>
        {book.data && <CoverPreview book={book.data} />}
      </div>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        {(["soft", "hard"] as const).map((value) => {
          const copy = formats.find((f) => f.id === format)?.prices[value];
          return (
            <ChoiceCard key={value} control={<Radio value={value} data-testid={`cover-${value}`} {...form.register("cover")} />}>
              <span className="flex flex-col">
                <span className="font-bold">{t(value === "soft" ? "order.cover.soft" : "order.cover.hard")}</span>
                <span className="text-muted">{copy !== undefined ? money(copy) : <PriceSkeleton />}</span>
              </span>
            </ChoiceCard>
          );
        })}
      </fieldset>

      <Card as="div" radius="lg" padding="lg" className="grid gap-5 sm:grid-cols-2">
        <Field label={t("order.recipient")} error={errors.recipientName && t("order.recipient.error")}>
          <Input data-testid="recipient-name" placeholder={t("order.recipient.placeholder")} {...form.register("recipientName")} />
        </Field>
        <Field label={t("order.phone")} error={errors.phone && t("order.phone.error")}>
          <Input data-testid="phone" inputMode="tel" {...form.register("phone")} />
        </Field>
        <Field label={t("order.email")} error={errors.email && t("order.email.error")} className="sm:col-span-2">
          <Input data-testid="order-email" type="email" autoComplete="email" placeholder={t("order.email.placeholder")} {...form.register("email")} />
        </Field>
        <Field label={t("order.city")}>
          <Select data-testid="city" data-options={cities.map((c) => c.id).join(" ")} {...form.register("cityId")} value={cityId}>
            {cities.map((city) => (
              <option key={city.id} value={city.id}>
                {cityName(city, locale)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("order.quantity")}>
          <Select data-testid="quantity" {...form.register("quantity")}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("order.address")} error={errors.address && t("order.address.error")} className="sm:col-span-2">
          <Input data-testid="address" placeholder={t("order.address.placeholder")} {...form.register("address")} />
        </Field>
      </Card>

      <Card data-testid="order-summary" border="none" className="flex flex-col gap-1">
        <div className="flex justify-between">
          <span>{t("order.books")}</span>
          <span>{price ? money(price.subtotal) : <PriceSkeleton />}</span>
        </div>
        <div className="flex justify-between">
          <span>{t("order.delivery")}</span>
          <span>{price ? (price.delivery.amount ? money(price.delivery) : t("order.free")) : <PriceSkeleton />}</span>
        </div>
        <div className="flex justify-between text-lg font-extrabold">
          <span>{t("order.total")}</span>
          <span data-testid="order-total" data-currency={price?.currency}>
            {price ? money(price.total) : <PriceSkeleton className="w-20" />}
          </span>
        </div>
      </Card>

      <Button
        type="submit"
        size="lg"
        data-testid="place-order"
        loading={order.isPending}
        disabled={!price || reformat.isPending}
        icon={<Printer className="size-5" />}
      >
        {t("order.submit")}
      </Button>
      <p className="text-center text-xs text-muted">{t("order.demo")}</p>
      {order.isError && <ErrorText>{t("order.error", { message: order.error.message })}</ErrorText>}
    </form>
  );
}

/** The cover at the chosen format's proportions, from the same renderer as the print file. */
function CoverPreview({ book }: { book: Book }) {
  const { t } = useI18n();
  const rendered = useRenderedBook(book);
  const { widthMm, heightMm, id } = book.layout.format;
  const boxPx = 180;
  const scale = boxPx / (Math.max(widthMm, heightMm) * PX_PER_MM);
  const cover = rendered?.pages[0];
  return (
    <figure
      data-testid="order-format-preview"
      data-format={id}
      data-width-mm={widthMm}
      data-height-mm={heightMm}
      className="flex flex-col items-center gap-2"
    >
      <BookStyles />
      <div
        className="overflow-hidden rounded-md shadow-lg"
        style={{ width: widthMm * PX_PER_MM * scale, height: heightMm * PX_PER_MM * scale, ["--fb-scale" as string]: String(scale) }}
      >
        {cover && <BookPage html={cover.html} widthMm={widthMm} heightMm={heightMm} />}
      </div>
      <figcaption className="text-xs text-muted">{t("order.format.size", { width: widthMm / 10, height: heightMm / 10 })}</figcaption>
    </figure>
  );
}
