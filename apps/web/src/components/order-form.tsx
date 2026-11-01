"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useQuery } from "@/lib/query";
import { CreateOrderSchema, cityName, type CreateOrderInput } from "@fabulka/shared";
import { Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { createOrder, getBook } from "@/lib/api";
import { useI18n } from "@/i18n/i18n";
import { useFormat } from "@/hooks/use-format";
import { useMe } from "@/lib/auth";
import { useCities } from "@/lib/cities";
import { useOrderPrice, useReference } from "@/lib/use-price";
import { PriceSkeleton } from "./price-skeleton";
import { ErrorText } from "./ui/notice";
import { Button } from "./ui/button";
import { ChoiceCard, Radio } from "./ui/choice";
import { Field } from "./ui/field";
import { Input, Select } from "./ui/input";
import { Card } from "./ui/card";
import { PageHeader } from "./ui/page";

type FormValues = z.input<typeof CreateOrderSchema>;

export function OrderForm({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { t, locale, info } = useI18n();
  const { kzt: formatKzt } = useFormat();
  const book = useQuery({ queryKey: ["book", id], queryFn: () => getBook(id) });
  const form = useForm<FormValues, unknown, CreateOrderInput>({
    resolver: zodResolver(CreateOrderSchema),
    defaultValues: { bookId: id, recipientName: "", phone: "+7 ", email: "", cityId: "almaty", address: "", cover: "soft", quantity: 1 },
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
  const reference = useReference();
  const cities = useCities();
  const price = useOrderPrice(cover, Number(quantity) || 1, cityId);
  // The owner may have taken the default city off the list: start from the first one listed then.
  useEffect(() => {
    if (cities.length && !cities.some((c) => c.id === form.getValues("cityId"))) form.setValue("cityId", cities[0].id);
  }, [cities, form]);

  const order = useMutation({
    mutationFn: createOrder,
    onSuccess: (created) => router.push(`/orders/${created.id}`),
  });

  // Print is priced in tenge and offered only where the country has it (the API refuses the rest).
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
    <form data-testid="order-form" noValidate onSubmit={form.handleSubmit((values) => order.mutate({ ...values, locale }))} className="flex flex-col gap-6">
      <PageHeader size="md" title={t("order.title")} lead={book.data?.title && `«${book.data.title}»`} />

      <fieldset className="grid gap-3 sm:grid-cols-2">
        {(["soft", "hard"] as const).map((value) => (
          <ChoiceCard key={value} control={<Radio value={value} data-testid={`cover-${value}`} {...form.register("cover")} />}>
            <span className="flex flex-col">
              <span className="font-bold">{t(value === "soft" ? "order.cover.soft" : "order.cover.hard")}</span>
              <span className="text-muted">{reference.data ? formatKzt(reference.data.prices.covers[value]) : <PriceSkeleton />}</span>
            </span>
          </ChoiceCard>
        ))}
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
          <Select data-testid="city" {...form.register("cityId")} value={cityId}>
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
      </Card>

      <Button type="submit" size="lg" data-testid="place-order" loading={order.isPending} disabled={!price} icon={<Printer className="size-5" />}>
        {t("order.submit")}
      </Button>
      <p className="text-center text-xs text-muted">{t("order.demo")}</p>
      {order.isError && <ErrorText>{t("order.error", { message: order.error.message })}</ErrorText>}
    </form>
  );
}
