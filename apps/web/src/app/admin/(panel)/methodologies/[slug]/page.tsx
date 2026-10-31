import { Suspense } from "react";
import { MethodologyPage } from "@/components/admin/methodology-editor";
import { T } from "@/components/t";

export default function AdminMethodologyPage({ params }: PageProps<"/admin/methodologies/[slug]">) {
  return (
    <Suspense fallback={<p className="text-muted"><T k="admin.loading" scope="admin" /></p>}>
      <MethodologyPage params={params} />
    </Suspense>
  );
}
