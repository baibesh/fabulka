import { BookForm } from "@/components/book/book-form";
import { PriceTag } from "@/components/book/price-tag";
import { T } from "@/i18n/t";
import { BackLink, PageContainer, PageHeader } from "@/components/ui/page";

export default function CreatePage() {
  return (
    <PageContainer width="md" gap="lg">
      <BackLink href="/catalog">
        <T k="common.back.catalog" />
      </BackLink>
      <PageHeader title={<T k="create.title" />} lead={<T k="create.lead" />}>
        <PriceTag kind="custom" />
      </PageHeader>
      <BookForm />
    </PageContainer>
  );
}
