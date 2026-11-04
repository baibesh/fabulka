import { Suspense } from "react";
import { StoryFormatPage } from "@/components/admin/story-format-editor";
import { T } from "@/i18n/t";

export default function AdminStoryFormatPage() {
  return (
    <Suspense fallback={<p className="text-muted"><T k="admin.loading" scope="admin" /></p>}>
      <StoryFormatPage />
    </Suspense>
  );
}
