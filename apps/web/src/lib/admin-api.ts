import {
  AdminBookRowSchema,
  AdminLoginOptionsSchema,
  AdminBookSchema,
  AdminMethodologySchema,
  AdminOrderSchema,
  AdminReferenceSchema,
  BlockedCountriesSchema,
  CitySchema,
  CountryEntrySchema,
  FaqItemSchema,
  AdminStatsSchema,
  AdminTemplateSchema,
  ClientErrorGroupSchema,
  JournalStatsSchema,
  MethodologyPreviewResultSchema,
  PricesSchema,
  PrintFormatSchema,
  type PrintFormat,
  AdminThemeSchema,
  type AdminTheme,
  ModelCallDetailSchema,
  ModelCallPageSchema,
  ModelCallSchema,
  type AdminBook,
  type AdminBookRow,
  type UpdateBook,
  type AdminLogin,
  type AdminLoginOptions,
  type AdminMethodology,
  type AdminOrder,
  type AdminReference,
  type BlockedCountries,
  type City,
  type CountryEntry,
  type FaqItem,
  type AdminStats,
  type AdminTemplate,
  type ClientErrorGroup,
  type CreateMethodology,
  type JournalCallsQuery,
  type JournalPeriod,
  type JournalStats,
  type MethodologyPreview,
  type MethodologyPreviewResult,
  type ModelCall,
  type ModelCallDetail,
  type ModelCallPage,
  type OrderStatus,
  type PinLayout,
  type Prices,
  type UpdateMethodology,
  type UpdateTemplate,
  AdminMeSchema,
  AdminSeoPageSchema,
  PublishSeoResultSchema,
  RedirectSchema,
  SeoHistoryEntrySchema,
  SeoImageResultSchema,
  SeoSettingsSchema,
  type AdminMe,
  type AdminSeoPage,
  type Language,
  type PublishSeoResult,
  type Redirect,
  type RedirectInput,
  type SaveSeoPage,
  type SeoHistoryEntry,
  type SeoImageResult,
  type SeoSettings,
} from "@fabulka/shared";
import { z } from "zod";
import { request } from "./api";

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const adminLogin = (login: AdminLogin) => request("/api/admin/login", json("POST", login));

/** Which ways into the admin are on: Keycloak (role admin) and the emergency password. */
export async function adminLoginOptions(): Promise<AdminLoginOptions> {
  return AdminLoginOptionsSchema.parse(await request("/api/admin/login-options"));
}
export const adminLogout = () => request("/api/admin/logout", { method: "POST" });
/** Who is signed in and which sections their roles open. */
export async function adminMe(): Promise<AdminMe> {
  return AdminMeSchema.parse(await request("/api/admin/me"));
}

export async function adminStats(): Promise<AdminStats> {
  return AdminStatsSchema.parse(await request("/api/admin/stats"));
}

export const setPaused = (paused: boolean) => request("/api/admin/pause", json("POST", { paused }));

export async function adminBooks(status?: string): Promise<AdminBookRow[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return AdminBookRowSchema.array().parse(await request(`/api/admin/books${query}`));
}

export async function adminBook(id: string): Promise<AdminBook> {
  return AdminBookSchema.parse(await request(`/api/admin/books/${id}`));
}

/** Puts a book among the home page's examples or takes it off, and sets the countries it shows in there. */
export async function updateBook(id: string, patch: UpdateBook): Promise<AdminBook> {
  return AdminBookSchema.parse(await request(`/api/admin/books/${id}`, json("PATCH", patch)));
}

/** Staff pin page layouts (null unpins) or change the theme; the API re-renders the book. */
export async function pinLayout(id: string, patch: PinLayout): Promise<AdminBook> {
  return AdminBookSchema.parse(await request(`/api/admin/books/${id}/layout`, json("PATCH", patch)));
}

export const deleteBook = (id: string) => request(`/api/admin/books/${id}`, { method: "DELETE" });

export async function adminOrders(): Promise<AdminOrder[]> {
  return AdminOrderSchema.array().parse(await request("/api/admin/orders"));
}

/** Moves an order to `status`; a `note` (up to 200 characters) is shown to the parent on that step. */
export async function setOrderStatus(id: string, status: OrderStatus, note?: string): Promise<AdminOrder> {
  return AdminOrderSchema.parse(await request(`/api/admin/orders/${id}`, json("PATCH", note ? { status, note } : { status })));
}

export async function adminTemplates(): Promise<AdminTemplate[]> {
  return AdminTemplateSchema.array().parse(await request("/api/admin/templates"));
}

export async function adminTemplate(slug: string): Promise<AdminTemplate> {
  return AdminTemplateSchema.parse(await request(`/api/admin/templates/${slug}`));
}

export async function updateTemplate(slug: string, patch: UpdateTemplate): Promise<AdminTemplate> {
  return AdminTemplateSchema.parse(await request(`/api/admin/templates/${slug}`, json("PATCH", patch)));
}

export async function adminMethodologies(): Promise<AdminMethodology[]> {
  return AdminMethodologySchema.array().parse(await request("/api/admin/methodologies"));
}

export async function adminMethodology(slug: string): Promise<AdminMethodology> {
  return AdminMethodologySchema.parse(await request(`/api/admin/methodologies/${encodeURIComponent(slug)}`));
}

export async function createMethodology(method: CreateMethodology): Promise<AdminMethodology> {
  return AdminMethodologySchema.parse(await request("/api/admin/methodologies", json("POST", method)));
}

export async function updateMethodology(slug: string, method: UpdateMethodology): Promise<AdminMethodology> {
  return AdminMethodologySchema.parse(await request(`/api/admin/methodologies/${encodeURIComponent(slug)}`, json("PUT", method)));
}

/** Refused with 409 methodology_in_use while catalog books or books follow the method. */
export const deleteMethodology = (slug: string) =>
  request(`/api/admin/methodologies/${encodeURIComponent(slug)}`, { method: "DELETE" });

/** The method part of the story prompt for a sample child, from the editor's unsaved fields. */
export async function previewMethodology(draft: MethodologyPreview): Promise<MethodologyPreviewResult> {
  return MethodologyPreviewResultSchema.parse(await request("/api/admin/methodologies/preview", json("POST", draft)));
}

export async function journalStats(period: JournalPeriod): Promise<JournalStats> {
  return JournalStatsSchema.parse(await request(`/api/admin/journal/stats?period=${period}`));
}

export async function journalCalls(query: JournalCallsQuery): Promise<ModelCallPage> {
  const params = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => !!entry[1]));
  return ModelCallPageSchema.parse(await request(`/api/admin/journal/calls?${params}`));
}

export async function journalCall(id: string): Promise<ModelCallDetail> {
  return ModelCallDetailSchema.parse(await request(`/api/admin/journal/calls/${id}`));
}

export async function journalErrors(period: JournalPeriod): Promise<ClientErrorGroup[]> {
  return ClientErrorGroupSchema.array().parse(await request(`/api/admin/journal/errors?period=${period}`));
}

/** A book's model calls in the order they were made. */
export async function bookCalls(id: string): Promise<ModelCall[]> {
  return ModelCallSchema.array().parse(await request(`/api/admin/books/${id}/calls`));
}

/** Prices, delivery cities and blocked countries (Meta's read-only list and the owner's extras). */
export async function adminReference(): Promise<AdminReference> {
  return AdminReferenceSchema.parse(await request("/api/admin/reference"));
}

export async function savePrices(prices: Prices): Promise<Prices> {
  return PricesSchema.parse(await request("/api/admin/reference/prices", json("PUT", prices)));
}

export async function adminThemes(): Promise<AdminTheme[]> {
  return AdminThemeSchema.array().parse(await request("/api/admin/themes"));
}

/** Refused with 422 theme_refused (the checks in the error's body) when a check fails. */
export async function proposeTheme(brief: string): Promise<AdminTheme> {
  return AdminThemeSchema.parse(await request("/api/admin/themes", json("POST", { brief })));
}

export async function publishTheme(id: string): Promise<AdminTheme> {
  return AdminThemeSchema.parse(await request(`/api/admin/themes/${id}/publish`, { method: "POST" }));
}

/** Takes a published theme back: no longer offered; books keep it, catalog books that named it pick by age. */
export async function unpublishTheme(id: string): Promise<AdminTheme> {
  return AdminThemeSchema.parse(await request(`/api/admin/themes/${id}/unpublish`, { method: "POST" }));
}

export const deleteTheme = (id: string) => request(`/api/admin/themes/${id}`, { method: "DELETE" });

export async function saveFormats(formats: PrintFormat[]): Promise<PrintFormat[]> {
  return PrintFormatSchema.array().parse(await request("/api/admin/reference/formats", json("PUT", formats)));
}

export async function saveCities(cities: City[]): Promise<City[]> {
  return CitySchema.array().parse(await request("/api/admin/reference/cities", json("PUT", cities)));
}

/** Refused with 400 country_policy_blocked (Meta's list) or country_blocked (the owner's) for a blocked code. */
export async function saveCountries(countries: CountryEntry[]): Promise<CountryEntry[]> {
  return CountryEntrySchema.array().parse(await request("/api/admin/reference/countries", json("PUT", countries)));
}

/** The landing's questions, in order, drafts included. */
export async function saveFaq(faq: FaqItem[]): Promise<FaqItem[]> {
  return FaqItemSchema.array().parse(await request("/api/admin/reference/faq", json("PUT", faq)));
}

/** Refused with 400 country_policy_blocked for a code on Meta's list. */
export async function saveBlocked(extra: string[]): Promise<BlockedCountries> {
  return BlockedCountriesSchema.parse(await request("/api/admin/reference/blocked", json("PUT", { extra })));
}

// ---- SEO (admin «SEO») ----------------------------------------------------------------------

export async function seoPages(language: Language): Promise<AdminSeoPage[]> {
  return AdminSeoPageSchema.array().parse(await request(`/api/admin/seo/pages?lang=${language}`));
}

export async function seoPage(key: string, language: Language): Promise<AdminSeoPage> {
  return AdminSeoPageSchema.parse(await request(`/api/admin/seo/page?${new URLSearchParams({ key, lang: language })}`));
}

export async function seoPending(): Promise<Record<string, number>> {
  return z.record(z.string(), z.number()).parse(await request("/api/admin/seo/pending"));
}

export async function saveSeoPage(body: SaveSeoPage): Promise<AdminSeoPage> {
  return AdminSeoPageSchema.parse(await request("/api/admin/seo/page", json("PUT", body)));
}

/** One page in one language, or (nothing) every page with unpublished changes. */
export async function publishSeo(target?: { key: string; language: Language }): Promise<PublishSeoResult> {
  return PublishSeoResultSchema.parse(await request("/api/admin/seo/publish", json("POST", target ?? {})));
}

export async function seoHistory(query: { key: string; language: Language } | { kind: "redirect" | "settings" }): Promise<SeoHistoryEntry[]> {
  const params = "kind" in query ? new URLSearchParams({ kind: query.kind }) : new URLSearchParams({ key: query.key, lang: query.language });
  return SeoHistoryEntrySchema.array().parse(await request(`/api/admin/seo/history?${params}`));
}

export async function revertSeo(id: string): Promise<AdminSeoPage> {
  return AdminSeoPageSchema.parse(await request(`/api/admin/seo/history/${encodeURIComponent(id)}/revert`, { method: "POST" }));
}

export async function uploadSeoImage(image: string): Promise<SeoImageResult> {
  return SeoImageResultSchema.parse(await request("/api/admin/seo/og-image", json("POST", { image })));
}

export async function seoRedirects(): Promise<Redirect[]> {
  return RedirectSchema.array().parse(await request("/api/admin/seo/redirects"));
}

export async function createRedirect(input: RedirectInput): Promise<Redirect> {
  return RedirectSchema.parse(await request("/api/admin/seo/redirects", json("POST", input)));
}

export async function updateRedirect(id: string, input: RedirectInput): Promise<Redirect> {
  return RedirectSchema.parse(await request(`/api/admin/seo/redirects/${encodeURIComponent(id)}`, json("PUT", input)));
}

export const deleteRedirect = (id: string) => request(`/api/admin/seo/redirects/${encodeURIComponent(id)}`, { method: "DELETE" });

export async function adminSeoSettings(): Promise<SeoSettings> {
  return SeoSettingsSchema.parse(await request("/api/admin/seo/settings"));
}

export async function saveSeoSettings(settings: SeoSettings): Promise<SeoSettings & { revalidated: boolean }> {
  const saved = (await request("/api/admin/seo/settings", json("PUT", settings))) as { revalidated?: unknown };
  return { ...SeoSettingsSchema.parse(saved), revalidated: saved.revalidated === true };
}
