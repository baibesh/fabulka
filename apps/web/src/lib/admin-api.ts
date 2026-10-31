import {
  AdminBookRowSchema,
  AdminLoginOptionsSchema,
  AdminBookSchema,
  AdminOrderSchema,
  AdminStatsSchema,
  AdminTemplateSchema,
  ClientErrorGroupSchema,
  JournalStatsSchema,
  ModelCallDetailSchema,
  ModelCallPageSchema,
  ModelCallSchema,
  type AdminBook,
  type AdminBookRow,
  type AdminLogin,
  type AdminLoginOptions,
  type AdminOrder,
  type AdminStats,
  type AdminTemplate,
  type ClientErrorGroup,
  type JournalCallsQuery,
  type JournalPeriod,
  type JournalStats,
  type ModelCall,
  type ModelCallDetail,
  type ModelCallPage,
  type OrderStatus,
  type UpdateTemplate,
} from "@fabulka/shared";
import { request } from "./api";

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const adminLogin = (login: AdminLogin) => request("/api/admin/login", json("POST", login));

/** Which ways into the admin are on: Keycloak (role admin) and the emergency password. */
export async function adminLoginOptions(): Promise<AdminLoginOptions> {
  return AdminLoginOptionsSchema.parse(await request("/api/admin/login-options"));
}
export const adminLogout = () => request("/api/admin/logout", { method: "POST" });
export const adminMe = () => request("/api/admin/me");

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

export async function setFeatured(id: string, featured: boolean): Promise<AdminBook> {
  return AdminBookSchema.parse(await request(`/api/admin/books/${id}`, json("PATCH", { featured })));
}

export const deleteBook = (id: string) => request(`/api/admin/books/${id}`, { method: "DELETE" });

export async function adminOrders(): Promise<AdminOrder[]> {
  return AdminOrderSchema.array().parse(await request("/api/admin/orders"));
}

export async function setOrderStatus(id: string, status: OrderStatus): Promise<AdminOrder> {
  return AdminOrderSchema.parse(await request(`/api/admin/orders/${id}`, json("PATCH", { status })));
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
