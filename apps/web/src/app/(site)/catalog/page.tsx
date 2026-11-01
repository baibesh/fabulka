import type { Metadata } from "next";
import { Catalog } from "@/components/catalog/catalog";
import { T } from "@/i18n/t";
import { PageContainer, PageHeader } from "@/components/ui/page";

export const metadata: Metadata = {
  title: "Каталог книг",
  description:
    "Персональные детские книги по методикам детского развития: первый день в садике, большие чувства, Наурыз и другие истории, где ваш ребёнок — главный герой.",
};

export default function CatalogPage() {
  return (
    <PageContainer gap="xl">
      <PageHeader title={<T k="catalog.title" />} lead={<T k="catalog.lead" />} className="max-w-3xl" />
      <Catalog />
    </PageContainer>
  );
}
