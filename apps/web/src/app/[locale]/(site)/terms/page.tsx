import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/legal-page";
import { PageContainer } from "@/components/ui/page";
import type { UiLocale } from "@/i18n/messages";
import { PageBreadcrumb } from "@/components/seo/json-ld";
import { pageMetadata } from "@/lib/seo-data";

export async function generateMetadata({ params }: PageProps<"/[locale]/terms">): Promise<Metadata> {
  return pageMetadata((await params).locale as UiLocale, "terms");
}

export default async function Page({ params }: PageProps<"/[locale]/terms">) {
  const locale = (await params).locale as UiLocale;
  return (
    <PageContainer width="md" gap="none">
      <PageBreadcrumb locale={locale} label="footer.terms" path="/terms" />
      <LegalPage doc="terms" />
    </PageContainer>
  );
}
