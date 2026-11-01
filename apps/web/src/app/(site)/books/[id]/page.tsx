import { Suspense } from "react";
import { BookView } from "@/components/book/book-view";
import { T } from "@/i18n/t";
import { PageContainer } from "@/components/ui/page";

export default function BookPage() {
  return (
    <PageContainer width="lg">
      <Suspense
        fallback={
          <p className="text-muted">
            <T k="common.loading" />
          </p>
        }
      >
        <BookView />
      </Suspense>
    </PageContainer>
  );
}
