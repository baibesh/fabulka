import { Suspense } from "react";
import { BookView } from "@/components/book-view";
import { T } from "@/components/t";
import { PageContainer } from "@/components/ui/page";

export default function BookPage({ params }: PageProps<"/books/[id]">) {
  return (
    <PageContainer width="lg">
      <Suspense
        fallback={
          <p className="text-muted">
            <T k="common.loading" />
          </p>
        }
      >
        <BookView params={params} />
      </Suspense>
    </PageContainer>
  );
}
