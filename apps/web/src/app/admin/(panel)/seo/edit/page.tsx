import { Suspense } from "react";
import { SeoEditor } from "@/components/admin/seo/seo-editor";

export default function AdminSeoEditPage() {
  return (
    <Suspense>
      <SeoEditor />
    </Suspense>
  );
}
