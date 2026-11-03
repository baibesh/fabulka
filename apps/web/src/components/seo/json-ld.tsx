import { bookPrice, localePath, toInputString } from "@fabulka/shared";
import { format } from "@/i18n/format";
import { MESSAGES, type MessageKey, type UiLocale } from "@/i18n/messages";
import { SITE_URL } from "@/lib/seo";
import { templateForSeo } from "@/lib/seo-data";
import { siteLocale } from "@/lib/seo-meta";
import { visitorCountry } from "@/lib/visitor-country";

/** Structured data for search engines (schema.org as JSON-LD); `<` escaped so no text can end the script. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

const absolute = (path: string) => (path.startsWith("http") ? path : path === "/" ? SITE_URL : `${SITE_URL}${path}`);
const t = (locale: UiLocale, key: MessageKey) => format(MESSAGES[siteLocale(locale)][key], undefined, siteLocale(locale));

/** The site and the company behind it: on the home page. */
export function SiteJsonLd({ locale }: { locale: UiLocale }) {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Organization",
            "@id": `${SITE_URL}/#organization`,
            name: "Fabulka",
            url: SITE_URL,
            logo: `${SITE_URL}/icon.svg`,
            email: "hello@fabulka.com",
          },
          {
            "@type": "WebSite",
            "@id": `${SITE_URL}/#website`,
            name: "Fabulka",
            url: absolute(localePath(locale, "/")),
            description: t(locale, "seo.site.description"),
            inLanguage: locale,
            publisher: { "@id": `${SITE_URL}/#organization` },
          },
        ],
      }}
    />
  );
}

/** Where a page sits: the home page first, the page itself last (names in the page's language). */
export function BreadcrumbJsonLd({ locale, items }: { locale: UiLocale; items: { name: string; path: string }[] }) {
  const trail = [{ name: t(locale, "seo.breadcrumb.home"), path: "/" }, ...items];
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: trail.map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: item.name,
          item: absolute(localePath(locale, item.path)),
        })),
      }}
    />
  );
}

/** A fixed page's breadcrumb by its message key (catalog, create, privacy, terms). */
export function PageBreadcrumb({ locale, label, path }: { locale: UiLocale; label: MessageKey; path: string }) {
  return <BreadcrumbJsonLd locale={locale} items={[{ name: t(locale, label), path }]} />;
}

/**
 * A catalog book as a product with its offer: the price of one more book of this kind in the
 * visitor's country (the cookie, else the IP, else "other", like CountryData), so render it inside
 * <Suspense>.
 */
export async function TemplateJsonLd({ locale, slug }: { locale: UiLocale; slug: string }) {
  const template = await templateForSeo(slug, locale);
  if (!template) return null;
  const { country, countries, reference } = await visitorCountry();
  const price = reference ? bookPrice("template", country, { ...reference, countries }) : null;
  const url = absolute(localePath(locale, `/catalog/${slug}`));
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": ["Product", "Book"],
          name: template.title,
          description: template.summary,
          ...(template.coverUrl ? { image: absolute(template.coverUrl) } : {}),
          url,
          inLanguage: template.languages,
          audience: { "@type": "PeopleAudience", suggestedMinAge: template.ageMin, suggestedMaxAge: template.ageMax },
          brand: { "@type": "Brand", name: "Fabulka" },
          ...(price
            ? {
                offers: {
                  "@type": "Offer",
                  // A decimal string in major units with the currency's shown decimals ("1900", "18.90").
                  price: toInputString(price),
                  priceCurrency: price.currency,
                  availability: "https://schema.org/InStock",
                  url,
                },
              }
            : {}),
        }}
      />
      <BreadcrumbJsonLd
        locale={locale}
        items={[
          { name: t(locale, "nav.catalog"), path: "/catalog" },
          { name: template.title, path: `/catalog/${slug}` },
        ]}
      />
    </>
  );
}
