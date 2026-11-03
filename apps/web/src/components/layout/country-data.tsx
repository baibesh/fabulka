import { DEFAULT_LANGUAGE, ExampleBookSchema, MethodologySchema, TemplateSchema, TemplateSummarySchema } from "@fabulka/shared";
import { QueryClient, dehydrate, type QueryKey } from "@tanstack/react-query";
import type { UiLocale } from "@/i18n/messages";
import { serverGet } from "@/lib/server-api";
import { visitorCountry } from "@/lib/visitor-country";
import { CountryScope } from "./country-scope";

/** What a page part needs besides the reference data (prices, countries, FAQ), which it always gets. */
export type CountryNeed = "templates" | "examples" | "methodologies";

/**
 * The visitor's country for the server render: from its cookie, else from the visitor's IP, else
 * "other" (visitorCountry), with the data that depends on it (and on the page's language) fetched
 * here, so the first HTML already has the right prices, currency, catalog, examples and FAQ.
 * Reading the cookie and the address makes this part dynamic: put it inside a <Suspense> and keep
 * the rest of the page static. Query keys match the client hooks
 * (useReference, useTemplates, useExamples, useMethodologies, the template page's query).
 */
export async function CountryData({
  locale = DEFAULT_LANGUAGE,
  need = [],
  template,
  children,
}: {
  /** The page's language, for the data that has one (the catalog, the examples, the methods). */
  locale?: UiLocale;
  need?: CountryNeed[];
  /** The catalog book's slug on its page (a route param, so it is awaited here, inside Suspense). */
  template?: Promise<string>;
  children: React.ReactNode;
}) {
  const { country, saved, detected, countries, reference } = await visitorCountry();

  const client = new QueryClient();
  const load = async <T,>(key: QueryKey, path: string, schema: { parse(value: unknown): T }) => {
    const data = await serverGet(path, schema);
    if (data !== undefined) client.setQueryData(key, data);
  };
  if (reference) client.setQueryData(["reference"], reference);
  const slug = template ? await template : undefined;
  await Promise.all([
    need.includes("templates") &&
      load(["templates", locale, country], `/api/templates?${new URLSearchParams({ lang: locale, country })}`, TemplateSummarySchema.array()),
    need.includes("examples") &&
      load(["examples", locale, country], `/api/books/examples?${new URLSearchParams({ lang: locale, country })}`, ExampleBookSchema.array()),
    need.includes("methodologies") && load(["methodologies", locale], `/api/methodologies?lang=${locale}`, MethodologySchema.array()),
    slug &&
      load(["template", slug, locale, country], `/api/templates/${encodeURIComponent(slug)}?${new URLSearchParams({ lang: locale, country })}`, TemplateSchema),
  ]);

  return (
    <CountryScope country={country} saved={saved} detected={detected} countries={countries} state={dehydrate(client)}>
      {children}
    </CountryScope>
  );
}
