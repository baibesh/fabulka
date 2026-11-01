import { Suspense } from "react";
import { OrderForm } from "@/components/order-form";
import { T } from "@/components/t";
import { BackLink, PageContainer } from "@/components/ui/page";

export default function OrderPage({ params }: PageProps<"/books/[id]/order">) {
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
        <OrderForm params={params} />
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
