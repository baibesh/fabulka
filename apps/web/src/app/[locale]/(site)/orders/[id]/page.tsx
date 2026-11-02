import type { Metadata } from "next";
import { Suspense } from "react";
import { OrderView } from "@/components/order/order-view";
import { T } from "@/i18n/t";
import { PageContainer } from "@/components/ui/page";

/** A family's own page: kept out of search (robots.txt disallows it too). */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function OrderStatusPage() {
  return (
    <PageContainer width="sm">
      <Suspense
        fallback={
          <p className="text-muted">
            <T k="common.loading" />
          </p>
        }
      >
        <OrderView />
      </Suspense>
    </PageContainer>
  );
}
