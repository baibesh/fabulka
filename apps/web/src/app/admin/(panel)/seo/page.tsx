import { Suspense } from "react";
import { SeoSection } from "@/components/admin/seo/seo-section";

export default function AdminSeoPage() {
  return (
    <Suspense>
      <SeoSection />
    </Suspense>
  );
}
