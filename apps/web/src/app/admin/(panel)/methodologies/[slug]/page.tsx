import { Suspense } from "react";
import { MethodologyPage } from "@/components/admin/methodology-editor";
import { T } from "@/i18n/t";

export default function AdminMethodologyPage() {
  return (
    <Suspense fallback={<p className="text-muted"><T k="admin.loading" scope="admin" /></p>}>
      <MethodologyPage />
    </Suspense>
  );
}
