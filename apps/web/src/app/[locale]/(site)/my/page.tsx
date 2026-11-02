import type { Metadata } from "next";
import { MyAccountNote, MyBooks } from "@/components/account/my-books";
import { MyOrders } from "@/components/order/my-orders";
import { T } from "@/i18n/t";
import { PageContainer, PageHeader } from "@/components/ui/page";

/** A family's own page: kept out of search (robots.txt disallows it too). */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function MyBooksPage() {
  return (
    <PageContainer>
      <PageHeader size="md" title={<T k="my.title" />} />
      <MyAccountNote />
      <MyBooks />
      <MyOrders />
    </PageContainer>
  );
}
