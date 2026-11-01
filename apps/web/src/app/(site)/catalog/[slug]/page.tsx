import { Suspense } from "react";
import { TemplateView } from "@/components/template-view";
import { T } from "@/components/t";
import { BackLink, PageContainer } from "@/components/ui/page";

export default function TemplatePage({ params }: PageProps<"/catalog/[slug]">) {
  return (
    <PageContainer width="md">
      <BackLink href="/catalog">
        <T k="common.back.catalog" />
      </BackLink>
      <Suspense
        fallback={
          <p className="text-muted">
            <T k="common.loading" />
          </p>
        }
      >
        <TemplateView params={params} />
      </Suspense>
    </PageContainer>
  );
}
