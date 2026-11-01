import { Suspense } from "react";
import { OrderView } from "@/components/order/order-view";
import { T } from "@/i18n/t";
import { PageContainer } from "@/components/ui/page";

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
