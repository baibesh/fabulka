import { MyAccountNote, MyBooks } from "@/components/my-books";
import { MyOrders } from "@/components/my-orders";
import { T } from "@/components/t";
import { PageContainer, PageHeader } from "@/components/ui/page";

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
