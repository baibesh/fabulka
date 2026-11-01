import { Suspense } from "react";
import { BookDetail } from "@/components/admin/book-detail";
import { T } from "@/i18n/t";

export default function AdminBookPage({ params }: PageProps<"/admin/books/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted"><T k="admin.loading" scope="admin" /></p>}>
      <BookDetail params={params} />
    </Suspense>
  );
}
