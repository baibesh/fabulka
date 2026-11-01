import {
  BookSchema,
  ExampleBookSchema,
  MethodologySchema,
  MyBookSchema,
  OrderSchema,
  QuotaSchema,
  ReferenceSchema,
  ServiceStatusSchema,
  TemplateSchema,
  TemplateSummarySchema,
  ToyUploadResultSchema,
  VoicePrefillSchema,
  type Book,
  type CreateBookInput,
  type CreateOrderInput,
  type ExampleBook,
  type Language,
  type Methodology,
  type Order,
  type Purchase,
  type Quota,
  type Reference,
  type ServiceStatus,
  type Template,
  type TemplateSummary,
  type VoicePrefill,
} from "@fabulka/shared";
import { savedCountry } from "@/i18n/i18n";
import { reportApiError, reportNetworkError } from "./telemetry";

const CLIENT_KEY = "wishbook.clientKey";
const DEMO_CODE = "wishbook.demoCode";

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Anonymous visitor id the free generation limit is counted against. */
/** When storage is blocked: a key for this page only, never one shared between visitors. */
let pageKey: string | null = null;

export function clientKey(): string {
  let key = stored(CLIENT_KEY);
  if (!key) {
    key = crypto.randomUUID();
    try {
      localStorage.setItem(CLIENT_KEY, key);
    } catch {
      pageKey ??= key;
      return pageKey;
    }
  }
  return key;
}

export function demoCode(): string | null {
  return stored(DEMO_CODE);
}

export function setDemoCode(code: string) {
  try {
    localStorage.setItem(DEMO_CODE, code.trim());
  } catch {
    // Private mode: the code just isn't remembered.
  }
}

/** An API error with the server's machine-readable code (e.g. limit_reached). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
  }
}

/** fetch, with failures the visitor sees reported to the journal (lib/telemetry). */
async function send(path: string, init: RequestInit): Promise<unknown> {
  const method = init.method ?? "GET";
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (error) {
    reportNetworkError(method, path, error);
    throw error;
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body ?? {}) as { code?: string; message?: unknown };
    const message = typeof error.message === "string" ? error.message : response.statusText;
    const failure = new ApiError(response.status, error.code, message);
    reportApiError(method, path, failure);
    throw failure;
  }
  return body;
}

export async function request(path: string, init?: RequestInit): Promise<unknown> {
  const code = demoCode();
  // The API prices purchases and allows print orders by the country chosen here (else the IP's).
  const country = savedCountry();
  return send(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-client-key": clientKey(),
      ...(code ? { "x-demo-code": code } : {}),
      ...(country ? { "x-country": country } : {}),
      ...init?.headers,
    },
  });
}

export async function createBook(input: CreateBookInput): Promise<Book> {
  return BookSchema.parse(await request("/api/books", { method: "POST", body: JSON.stringify(input) }));
}

/** Sends the toy photo (a JPEG data URL); the book then refers to it by the returned id. */
export async function uploadToy(image: string): Promise<string> {
  const result = ToyUploadResultSchema.parse(await request("/api/toys", { method: "POST", body: JSON.stringify({ image }) }));
  return result.upload;
}

/**
 * Fills in the form from the parent's recording: a 16 kHz mono WAV, at most 60 s. `template` is the
 * catalog book's slug on its form, so the answers to its questions come back too. Sent as multipart,
 * so the browser sets the content type with its boundary.
 */
export async function transcribeVoice(audio: Blob, language: Language, template?: string): Promise<VoicePrefill> {
  const form = new FormData();
  form.append("audio", audio, "recording.wav");
  form.append("language", language);
  if (template) form.append("template", template);
  const code = demoCode();
  const body = await send("/api/voice", {
    method: "POST",
    body: form,
    headers: { "x-client-key": clientKey(), ...(code ? { "x-demo-code": code } : {}) },
  });
  return VoicePrefillSchema.parse(body);
}

export async function listTemplates(lang: Language): Promise<TemplateSummary[]> {
  return TemplateSummarySchema.array().parse(await request(`/api/templates?lang=${lang}`));
}

export async function getTemplate(slug: string, lang: Language): Promise<Template> {
  return TemplateSchema.parse(await request(`/api/templates/${encodeURIComponent(slug)}?lang=${lang}`));
}

/** The story methods on offer (published), with their names and summaries in `lang`. */
export async function listMethodologies(lang: Language): Promise<Methodology[]> {
  return MethodologySchema.array().parse(await request(`/api/methodologies?lang=${lang}`));
}

export async function listMyBooks() {
  return MyBookSchema.array().parse(await request("/api/books"));
}

/** Finished books the admin picked for every visitor to open. */
export async function listExamples(): Promise<ExampleBook[]> {
  return ExampleBookSchema.array().parse(await request("/api/books/examples"));
}

/** Whether new books are being created right now. */
export async function getStatus(): Promise<ServiceStatus> {
  return ServiceStatusSchema.parse(await request("/api/status"));
}

export async function getBook(id: string): Promise<Book> {
  return BookSchema.parse(await request(`/api/books/${id}`));
}

/** The owner's prices and delivery cities: every price on the site comes from these. */
export async function getReference(): Promise<Reference> {
  return ReferenceSchema.parse(await request("/api/reference"));
}

/** The visitor's country by IP, or null when unknown (e.g. locally). */
export async function whereAmI(): Promise<string | null> {
  const body = (await request("/api/geo")) as { country: string | null };
  return body.country;
}

/** Records that someone in a country without print wants this book printed. */
export async function wantPrint(bookId: string) {
  await request(`/api/books/${bookId}/print-interest`, { method: "POST" });
}

export async function getQuota(): Promise<Quota> {
  return QuotaSchema.parse(await request("/api/quota"));
}

/** Demo checkout: one more book of this kind, nothing is charged. The receipt goes to `email`. */
export async function buyBook(purchase: Purchase): Promise<Quota> {
  return QuotaSchema.parse(await request("/api/quota/purchase", { method: "POST", body: JSON.stringify(purchase) }));
}

export async function createOrder(order: CreateOrderInput): Promise<Order> {
  return OrderSchema.parse(await request("/api/orders", { method: "POST", body: JSON.stringify(order) }));
}

export async function getOrder(id: string): Promise<Order> {
  return OrderSchema.parse(await request(`/api/orders/${id}`));
}

/** «Мои заказы»: the account's orders, or this browser's while signed out, newest first. */
export async function listMyOrders(): Promise<Order[]> {
  return OrderSchema.array().parse(await request("/api/orders/mine"));
}
