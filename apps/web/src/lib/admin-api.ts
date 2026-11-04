import {
  AdminBookRowSchema,
  AdminConsentSchema,
  AdminConsentVersionSchema,
  type AdminConsent,
  type AdminConsentVersion,
  type ConsentClause,
  AdminLoginOptionsSchema,
  AdminBookSchema,
  AdminMethodologySchema,
  AdminStoryFormatSchema,
  type AdminStoryFormat,
  type CreateStoryFormat,
  type UpdateStoryFormat,
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
  BookPricesSchema,
  AdminFxSchema,
  PrintFormatSchema,
  type PrintFormat,
  AdminThemeSchema,
  type AdminTheme,
  ModelCallDetailSchema,
  ModelCallPageSchema,
  ModelCallSchema,
  type AdminBook,
  type AdminBookRow,
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
  type BookPrices,
  type AdminFx,
  type Currency,
  type UpdateMethodology,
  type UpdateTemplate,
  AdminMeSchema,
  AdminExampleSchema,
  ExampleCandidateSchema,
  VisitorMatrixSchema,
  CountryLandingSchema,
  CountryDeliverySchema,
  CountryFormatOverridesSchema,
  type CountryDelivery,
  type CountryFormatOverrides,
  type AdminExample,
  type CountriesMode,
  type CountryLanding,
  type ExampleCandidate,
  type VisitorMatrix,
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
  InviteResultSchema,
  StaffMemberSchema,
  StaffRoleSchema,
  type CreateStaffRole,
  type InviteResult,
  type InviteStaff,
  type StaffMember,
  type StaffRole,
  type UpdateStaff,
  type UpdateStaffRole,
  AuditPageSchema,
  CountryStatsSchema,
  StaffBudgetSchema,
  StaffCapDefaultsSchema,
  type AuditPage,
  type AuditQuery,
  type CountryStats,
  type StaffBudget,
  type StaffCapDefaults,
  type StaffCapOverride,
  IllustratorReferenceSchema,
  PageFlagSchema,
  type CreatePageFlag,
  type CreateReference,
  type IllustratorReference,
  type PageFlag,
  type UpdateReference,
} from "@fabulka/shared";
import {
  CountriesOverviewSchema,
  LandingBookSchema,
  type CountryOverview,
  type LandingBook,
  type LandingImageLanguage,
  type LandingImageSlot,
  type LandingImageUpload,
} from "@fabulka/shared";
import { AdminSearchSchema, InboxSchema, type AdminSearch, type Inbox } from "@fabulka/shared";
import { z } from "zod";
import { request } from "./api";

/** The workspace's Inbox: the global one (country null) or a country's. */
export async function adminInbox(country: string | null): Promise<Inbox> {
  const query = country ? `?country=${encodeURIComponent(country)}` : "";
  return InboxSchema.parse(await request(`/api/admin/inbox${query}`));
}

/** The command palette's search: books by title, child's name or id; orders by number. */
export async function adminSearch(q: string): Promise<AdminSearch> {
  return AdminSearchSchema.parse(await request(`/api/admin/search?${new URLSearchParams({ q })}`));
}

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

/** A country manager's dashboard: their countries (the working one when picked) only. */
export async function adminCountryStats(country: string | null): Promise<CountryStats> {
  const query = country ? `?country=${encodeURIComponent(country)}` : "";
  return CountryStatsSchema.parse(await request(`/api/admin/stats/countries${query}`));
}

/** What the signed-in person may still spend today on staff generation, for an action in `country`. */
export async function myBudget(country: string | null): Promise<StaffBudget> {
  const query = country ? `?country=${encodeURIComponent(country)}` : "";
  return StaffBudgetSchema.parse(await request(`/api/admin/caps/me${query}`));
}

// ---- Activity --------------------------------------------------------------------------------------

/** The filters as a query string (empty ones left out). */
export function activityQuery(query: AuditQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

export async function activity(query: AuditQuery): Promise<AuditPage> {
  return AuditPageSchema.parse(await request(`/api/admin/activity${activityQuery(query)}`));
}

export async function activityActors(): Promise<string[]> {
  return z.array(z.string()).parse(await request("/api/admin/activity/actors"));
}

/** The CSV of the filtered list (a download link: the browser sends the admin cookie). */
export const activityCsvUrl = (query: AuditQuery) => `/api/admin/activity/export.csv${activityQuery({ ...query, cursor: undefined, limit: undefined })}`;

export async function adminBooks(status?: string): Promise<AdminBookRow[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return AdminBookRowSchema.array().parse(await request(`/api/admin/books${query}`));
}

export async function adminBook(id: string): Promise<AdminBook> {
  return AdminBookSchema.parse(await request(`/api/admin/books/${id}`));
}

/** Staff pin page layouts (null unpins) or change the theme; the API re-renders the book. */
export async function pinLayout(id: string, patch: PinLayout): Promise<AdminBook> {
  return AdminBookSchema.parse(await request(`/api/admin/books/${id}/layout`, json("PATCH", patch)));
}

export const deleteBook = (id: string) => request(`/api/admin/books/${id}`, { method: "DELETE" });

// ---- Examples (home page stories with a version per language) ----------------------------------

/** Every example in the home page's order, with its versions in language order. */
export async function adminExamples(): Promise<AdminExample[]> {
  return AdminExampleSchema.array().parse(await request("/api/admin/examples"));
}

/** A new example with this finished book as its first version, shown in `countries` (none: as the API decides for the session). */
export async function createExample(bookId: string, countries?: string[]): Promise<AdminExample> {
  return AdminExampleSchema.parse(await request("/api/admin/examples", json("POST", countries ? { bookId, countries } : { bookId })));
}

/** Finished books a new example may be made from, in the working country (none: every country of the session). */
export async function exampleCandidates(country: string | null): Promise<ExampleCandidate[]> {
  const query = country ? `?country=${encodeURIComponent(country)}` : "";
  return ExampleCandidateSchema.array().parse(await request(`/api/admin/examples/candidates${query}`));
}

/** What a visitor sees per country × language: the site's own selection. */
export async function visitorMatrix(): Promise<VisitorMatrix> {
  return VisitorMatrixSchema.parse(await request("/api/admin/examples/matrix"));
}

/** A finished book as the example's version in the book's language. */
export async function addExampleVersion(id: string, bookId: string): Promise<AdminExample> {
  return AdminExampleSchema.parse(await request(`/api/admin/examples/${id}/versions`, json("POST", { bookId })));
}

/** Takes one version off (its book stays). */
export const removeExampleVersion = (id: string, language: Language) =>
  request(`/api/admin/examples/${id}/versions/${language}`, { method: "DELETE" });

/** Takes the example off the home page (its books stay). */
export const removeExample = (id: string) => request(`/api/admin/examples/${id}`, { method: "DELETE" });

/** Where the example shows (include) or does not (exclude); an empty list follows its catalog book. */
export async function updateExample(id: string, countries: string[], mode: CountriesMode = "include"): Promise<AdminExample> {
  return AdminExampleSchema.parse(await request(`/api/admin/examples/${id}`, json("PATCH", { countries, mode })));
}

/** The home page's order: every example's id. */
export async function reorderExamples(ids: string[]): Promise<AdminExample[]> {
  return AdminExampleSchema.array().parse(await request("/api/admin/examples/order", json("POST", { ids })));
}

/** Starts translating the story into these languages (background jobs; the versions show "translating"). */
export async function translateExample(id: string, languages: Language[], country: string | null = null): Promise<AdminExample> {
  const query = country ? `?country=${encodeURIComponent(country)}` : "";
  return AdminExampleSchema.parse(await request(`/api/admin/examples/${id}/translate${query}`, json("POST", { languages })));
}

/** The session's orders, in the working country when one is picked. */
export async function adminOrders(country: string | null = null): Promise<AdminOrder[]> {
  const query = country ? `?country=${encodeURIComponent(country)}` : "";
  return AdminOrderSchema.array().parse(await request(`/api/admin/orders${query}`));
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

/** Shows or hides the catalog book in one country; every other country stays as it is. */
export async function setTemplateVisibility(slug: string, country: string, visible: boolean): Promise<AdminTemplate> {
  return AdminTemplateSchema.parse(await request(`/api/admin/templates/${slug}/visibility`, json("PUT", { country, visible })));
}

/** Sets (or clears, with null) a sample in one language: global (country null) or one country's. */
export async function setTemplateSample(slug: string, country: string | null, language: Language, bookId: string | null): Promise<AdminTemplate> {
  return AdminTemplateSchema.parse(await request(`/api/admin/templates/${slug}/samples`, json("PUT", { country, language, bookId })));
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

export async function adminStoryFormats(): Promise<AdminStoryFormat[]> {
  return AdminStoryFormatSchema.array().parse(await request("/api/admin/story-formats"));
}

export async function adminStoryFormat(slug: string): Promise<AdminStoryFormat> {
  return AdminStoryFormatSchema.parse(await request(`/api/admin/story-formats/${encodeURIComponent(slug)}`));
}

export async function createStoryFormat(format: CreateStoryFormat): Promise<AdminStoryFormat> {
  return AdminStoryFormatSchema.parse(await request("/api/admin/story-formats", json("POST", format)));
}

export async function updateStoryFormat(slug: string, format: UpdateStoryFormat): Promise<AdminStoryFormat> {
  return AdminStoryFormatSchema.parse(await request(`/api/admin/story-formats/${encodeURIComponent(slug)}`, json("PUT", format)));
}

/** Refused with 409 story_format_in_use while methods or books use it (always for the picture book). */
export const deleteStoryFormat = (slug: string) =>
  request(`/api/admin/story-formats/${encodeURIComponent(slug)}`, { method: "DELETE" });

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

/** One country's delivery cities, in order (replacing the ones it had). */
export async function saveCountryCities(country: string, cities: City[]): Promise<City[]> {
  return CitySchema.array().parse(await request(`/api/admin/reference/cities?country=${encodeURIComponent(country)}`, json("PUT", cities)));
}

/** A country's own delivery fee and rule, or (country null) the default fee of `delivery.currency`. */
export async function saveDelivery(country: string | null, delivery: CountryDelivery): Promise<CountryDelivery> {
  const query = country ? `?country=${encodeURIComponent(country)}` : "";
  return CountryDeliverySchema.parse(await request(`/api/admin/reference/delivery${query}`, json("PUT", delivery)));
}

/** The country pays the global delivery fee again. */
export const clearDelivery = (country: string) =>
  request(`/api/admin/reference/delivery?country=${encodeURIComponent(country)}`, { method: "DELETE" });

/** A country's own format offer and cover prices, by format id. */
export async function saveCountryFormats(country: string, overrides: CountryFormatOverrides): Promise<CountryFormatOverrides> {
  return CountryFormatOverridesSchema.parse(
    await request(`/api/admin/reference/country-formats?country=${encodeURIComponent(country)}`, json("PUT", overrides)),
  );
}

/** The country offers and prices formats as globally again. */
export const clearCountryFormats = (country: string) =>
  request(`/api/admin/reference/country-formats?country=${encodeURIComponent(country)}`, { method: "DELETE" });

/** One country's own book prices, in its currency (its visitors are priced from them instead of its currency's default). */
export async function saveCountryPrices(country: string, prices: BookPrices): Promise<BookPrices> {
  return BookPricesSchema.parse(await request(`/api/admin/reference/prices?country=${encodeURIComponent(country)}`, json("PUT", prices)));
}

/** The country is priced from the global list again. */
export const clearCountryPrices = (country: string) =>
  request(`/api/admin/reference/prices?country=${encodeURIComponent(country)}`, { method: "DELETE" });

/** One country's landing overrides. */
export async function saveLanding(country: string, landing: CountryLanding): Promise<CountryLanding> {
  return CountryLandingSchema.parse(await request(`/api/admin/reference/landing?country=${encodeURIComponent(country)}`, json("PUT", landing)));
}

/** One landing picture of the country (a slot in a language, or "all"), from an upload or a finished book. */
export async function saveLandingImage(country: string, image: LandingImageUpload): Promise<CountryLanding> {
  return CountryLandingSchema.parse(await request(`/api/admin/reference/landing/image?country=${encodeURIComponent(country)}`, json("POST", image)));
}

/** The default picture shows again (or the country's for all languages). */
export async function clearLandingImage(country: string, slot: LandingImageSlot, language: LandingImageLanguage): Promise<CountryLanding | null> {
  const params = new URLSearchParams({ country, slot, language });
  return CountryLandingSchema.nullish().parse(await request(`/api/admin/reference/landing/image?${params}`, { method: "DELETE" })) ?? null;
}

/** Finished books a landing picture may be taken from. */
export async function landingBooks(country: string): Promise<LandingBook[]> {
  return LandingBookSchema.array().parse(await request(`/api/admin/reference/landing/books?country=${encodeURIComponent(country)}`));
}

/** Per country, everything a visitor gets, and the gaps. */
export async function countriesOverview(): Promise<CountryOverview[]> {
  return CountriesOverviewSchema.parse(await request("/api/admin/examples/overview"));
}

/** The country's landing shows the defaults again. */
export const clearLanding = (country: string) =>
  request(`/api/admin/reference/landing?country=${encodeURIComponent(country)}`, { method: "DELETE" });

/** One currency's default book prices. */
export async function savePrices(prices: BookPrices): Promise<BookPrices> {
  return BookPricesSchema.parse(await request("/api/admin/reference/prices", json("PUT", prices)));
}

/** Exchange rates to USD (reports only): in use, last fetched, overrides. */
export async function adminFx(): Promise<AdminFx> {
  return AdminFxSchema.parse(await request("/api/admin/fx"));
}

/** A superadmin's rate for one currency (dollars for one unit). */
export async function saveFxRate(currency: Currency, rate: string): Promise<AdminFx> {
  return AdminFxSchema.parse(await request("/api/admin/fx", json("PUT", { currency, rate })));
}

/** Back to the fetched rate. */
export async function clearFxRate(currency: Currency): Promise<AdminFx> {
  return AdminFxSchema.parse(await request(`/api/admin/fx?currency=${currency}`, { method: "DELETE" }));
}

/** Fetches today's rates now. */
export async function refreshFx(): Promise<AdminFx> {
  return AdminFxSchema.parse(await request("/api/admin/fx/refresh", { method: "POST" }));
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

// ---- Team (superadmin) ---------------------------------------------------------------------------

export async function teamMembers(): Promise<StaffMember[]> {
  return z.array(StaffMemberSchema).parse(await request("/api/admin/team"));
}

export async function inviteStaff(invite: InviteStaff): Promise<InviteResult> {
  return InviteResultSchema.parse(await request("/api/admin/team", json("POST", invite)));
}

export async function updateStaff(id: string, patch: UpdateStaff): Promise<StaffMember> {
  return StaffMemberSchema.parse(await request(`/api/admin/team/${encodeURIComponent(id)}`, json("PATCH", patch)));
}

export async function setStaffEnabled(id: string, enabled: boolean): Promise<StaffMember> {
  return StaffMemberSchema.parse(await request(`/api/admin/team/${encodeURIComponent(id)}/${enabled ? "enable" : "disable"}`, { method: "POST" }));
}

export async function resendInvite(id: string): Promise<InviteResult> {
  return InviteResultSchema.parse(await request(`/api/admin/team/${encodeURIComponent(id)}/resend`, { method: "POST" }));
}

export async function staffRoles(): Promise<StaffRole[]> {
  return z.array(StaffRoleSchema).parse(await request("/api/admin/team/roles"));
}

export async function createStaffRole(role: CreateStaffRole): Promise<StaffRole> {
  return StaffRoleSchema.parse(await request("/api/admin/team/roles", json("POST", role)));
}

export async function updateStaffRole(key: string, role: UpdateStaffRole): Promise<StaffRole> {
  return StaffRoleSchema.parse(await request(`/api/admin/team/roles/${encodeURIComponent(key)}`, json("PUT", role)));
}

export const deleteStaffRole = (key: string) => request(`/api/admin/team/roles/${encodeURIComponent(key)}`, { method: "DELETE" });

/** The default daily caps on staff generation (each person, each country); null is no cap. */
export async function staffCapDefaults(): Promise<StaffCapDefaults> {
  return StaffCapDefaultsSchema.parse(await request("/api/admin/team/caps"));
}

export async function saveStaffCapDefaults(defaults: StaffCapDefaults): Promise<StaffCapDefaults> {
  return StaffCapDefaultsSchema.parse(await request("/api/admin/team/caps", json("PUT", defaults)));
}

/** Someone's own daily cap (null: the default), or none at all. */
export async function setStaffCap(id: string, cap: StaffCapOverride): Promise<StaffMember> {
  return StaffMemberSchema.parse(await request(`/api/admin/team/${encodeURIComponent(id)}/cap`, json("PUT", cap)));
}

// ---- Illustrator references and review ---------------------------------------------------------

export async function adminReferences(): Promise<IllustratorReference[]> {
  return IllustratorReferenceSchema.array().parse(await request("/api/admin/references"));
}

export async function uploadReference(input: CreateReference): Promise<IllustratorReference> {
  return IllustratorReferenceSchema.parse(await request("/api/admin/references", json("POST", input)));
}

export async function updateReference(id: string, patch: UpdateReference): Promise<IllustratorReference> {
  return IllustratorReferenceSchema.parse(await request(`/api/admin/references/${id}`, json("PATCH", patch)));
}

/** One slot's pictures in their new order. */
export async function reorderReferences(ids: string[]): Promise<IllustratorReference[]> {
  return IllustratorReferenceSchema.array().parse(await request("/api/admin/references/order", json("PUT", { ids })));
}

export const deleteReference = (id: string) => request(`/api/admin/references/${id}`, { method: "DELETE" });

export async function pageFlags(): Promise<PageFlag[]> {
  return PageFlagSchema.array().parse(await request("/api/admin/flags"));
}

export async function bookFlags(id: string): Promise<PageFlag[]> {
  return PageFlagSchema.array().parse(await request(`/api/admin/books/${id}/flags`));
}

export async function flagPage(id: string, flag: CreatePageFlag): Promise<PageFlag> {
  return PageFlagSchema.parse(await request(`/api/admin/books/${id}/flags`, json("POST", flag)));
}

export async function resolveFlag(id: string, resolved: boolean): Promise<PageFlag> {
  return PageFlagSchema.parse(await request(`/api/admin/flags/${id}`, json("PATCH", { resolved })));
}

/** Admin «Consent»: every language's current consent text and its versions. */
export async function adminConsent(): Promise<AdminConsent> {
  return AdminConsentSchema.parse(await request("/api/admin/consent"));
}

/** Saves one language's clauses as a new version (the same clauses add none); returns the version now shown. */
export async function saveConsent(language: Language, clauses: ConsentClause[]): Promise<AdminConsentVersion> {
  return AdminConsentVersionSchema.parse(await request(`/api/admin/consent/${language}`, json("PUT", { clauses })));
}
