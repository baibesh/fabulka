import type { Metadata } from "next";
import { Suspense } from "react";
import { OrderForm } from "@/components/order/order-form";
import { T } from "@/i18n/t";
import { BackLink, PageContainer } from "@/components/ui/page";

/** A family's own page: kept out of search (robots.txt disallows it too). */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function OrderPage({ params }: PageProps<"/[locale]/books/[id]/order">) {
  return (
    <PageContainer width="sm">
      <Suspense
        fallback={
          <p className="text-muted">
            <T k="common.loading" />
          </p>
        }
      >
        <BackToBook params={params} />
        <OrderForm />
      </Suspense>
    </PageContainer>
  );
}

async function BackToBook({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <BackLink href={`/books/${id}`}>
      <T k="common.back.book" />
    </BackLink>
  );
}
