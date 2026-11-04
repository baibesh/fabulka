import { z } from "zod";
import { MethodologySlugSchema } from "./methodologies";
import { LanguageSchema, type Language } from "./language";
import {
  BlockKindSchema,
  BookLayoutSchema,
  BookThemeSchema,
  DedicationSchema,
  PHOTO_MAX_BYTES,
  PageVariantSchema,
  PhotoCaptionSchema,
  TemplateBlocksSchema,
  ThemeCheckSchema,
} from "./layout";
import { PaymentProviderSchema, TemplateCountriesSchema, bookPricesFor, type City, type Country, type LocalFormat, type PricingData } from "./reference";
import { CurrencySchema, MoneySchema, RevenueSchema, money, multiplyMoney, type Currency, type Money } from "./money";
import { CountriesModeSchema } from "./country-rules";
import { GenerationViewSchema } from "./generation";
import { FrameRectSchema, PipelineStepIdSchema, TextKindSchema } from "./formats";
import type { RenderablePage } from "./layout";

export * from "./language";
export * from "./methodologies";
export * from "./reference";
export * from "./money";
export * from "./labels";
export * from "./layout";
export * from "./locale-path";
export * from "./seo";
export * from "./admin-access";
export * from "./staff";
export * from "./examples";
export * from "./country-rules";
export * from "./generation";
export * from "./audit";
export * from "./references";
export * from "./formats";
export * from "./scenario";

/** Ages a book is written for (the form's picker, catalog books' ranges, the voice prefill). */
export const CHILD_AGE_MIN = 2;
export const CHILD_AGE_MAX = 12;

/** What the parent tells us about the child. */
export const ChildProfileSchema = z.object({
  name: z.string().trim().min(1).max(40),
  age: z.coerce.number().int().min(CHILD_AGE_MIN).max(CHILD_AGE_MAX),
  gender: z.enum(["boy", "girl"]),
  interests: z.array(z.string().trim().min(1).max(40)).min(1).max(5),
  pet: z.string().trim().max(60).optional(),
  city: z.string().trim().min(1).max(60),
  language: LanguageSchema.default("ru"),
});
export type ChildProfile = z.infer<typeof ChildProfileSchema>;

// ---- Catalog books -------------------------------------------------------------

/** A question a catalog book asks the parent; the answer goes into the story. */
export const TemplateQuestionSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().min(1),
  kind: z.enum(["text", "choice"]),
  options: z.array(z.string().min(1)).optional(),
  required: z.boolean().default(false),
  placeholder: z.string().optional(),
});
export type TemplateQuestion = z.infer<typeof TemplateQuestionSchema>;

/** A catalog book's text in another interface language; questions by key. */
export const TemplateTranslationSchema = z.object({
  title: z.string(),
  summary: z.string(),
  questions: z.record(
    z.string(),
    z.object({ label: z.string(), placeholder: z.string().optional(), options: z.array(z.string()).optional() }),
  ),
});
export type TemplateTranslation = z.infer<typeof TemplateTranslationSchema>;

/** A catalog card. */
export const TemplateSummarySchema = z.object({
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  ageMin: z.number().int(),
  ageMax: z.number().int(),
  /** Method slug; its name and summary come from GET /methodologies. */
  methodology: z.string(),
  languages: z.array(LanguageSchema),
  coverUrl: z.string().nullable(),
});
export type TemplateSummary = z.infer<typeof TemplateSummarySchema>;

export const TemplateSchema = TemplateSummarySchema.extend({
  questions: z.array(TemplateQuestionSchema),
  /**
   * A finished book made from this template to show as an example (GET /books/:id), or null: the
   * one in the requested language, else in its fallback (pickLanguage).
   */
  sampleBookId: z.string().nullable(),
  /** The sample's language; another than the requested one when it fell back. */
  sampleLanguage: LanguageSchema.nullable(),
  /**
   * What the sample book was made from, so its page can point out what a book of your own changes;
   * null without a sample. Answers are by question key, as the sample's parent gave them.
   */
  sampleDetails: z
    .object({
      name: z.string(),
      city: z.string(),
      pet: z.string().nullable(),
      toyName: z.string().nullable(),
      answers: z.record(z.string(), z.string()),
    })
    .nullable(),
});
export type Template = z.infer<typeof TemplateSchema>;

/** Answers by question key. Kept short: they go into the prompt. */
export const AnswersSchema = z.record(z.string(), z.string().trim().max(200));
export type Answers = z.infer<typeof AnswersSchema>;

/** The first question `answers` fail and why, or null when they satisfy `questions`. */
export function answersProblem(
  questions: TemplateQuestion[],
  answers: Answers,
): { question: TemplateQuestion; answer: string; reason: "required" | "unknown_option" } | null {
  for (const q of questions) {
    const answer = answers[q.key]?.trim() ?? "";
    if (q.required && !answer) return { question: q, answer, reason: "required" };
    if (answer && q.kind === "choice" && q.options && !q.options.includes(answer)) {
      return { question: q, answer, reason: "unknown_option" };
    }
  }
  return null;
}

export const CreateBookSchema = z.object({
  child: ChildProfileSchema,
  /** Catalog book slug; the book then follows its plot, method and questions. */
  template: z.string().min(1).optional(),
  answers: AnswersSchema.optional(),
  /**
   * Story method for a book of your own: a published one that fits the child's age (checked by the
   * API, which knows the methods). Left out, one is picked by age.
   */
  methodology: MethodologySlugSchema.optional(),
  /** What a book of your own is about, in the parent's words ("first day at kindergarten"). */
  theme: z.string().trim().min(3).max(200).optional(),
  /** The child's favourite toy, from a photo uploaded to POST /toys; it joins the story. */
  toy: z
    .object({
      upload: z.string().regex(/^[a-z0-9]{10,40}$/),
      name: z.string().trim().max(40).optional(),
    })
    .optional(),
});
export type CreateBookInput = z.infer<typeof CreateBookSchema>;

/** Generation stages, in order. "toy" runs only when the parent sent a photo of a toy. */
export const BOOK_STATUSES = ["queued", "toy", "story", "hero", "pages", "pdf", "done", "failed"] as const;
export const BookStatusSchema = z.enum(BOOK_STATUSES);
export type BookStatus = z.infer<typeof BookStatusSchema>;

export const BookPageSchema = z.object({
  page: z.number().int(),
  /** The page's prose (its narration; on a panel page its captions and lines), for lists and older clients. */
  text: z.string(),
  /** The page's picture (a panel page's first frame). */
  imageUrl: z.string().nullable(),
  /** Every version of the picture was refused: a vignette page with the hero's sheet (older APIs leave it out). */
  vignette: z.boolean().optional(),
  /** The grid's id ("full" for a picture book page; older APIs leave it out). */
  grid: z.string().optional(),
  /** Its frames: each one's box on the page (0..1) and picture (older APIs leave them out: one full frame). */
  frames: z
    .array(z.object({ frame: z.number().int(), rect: FrameRectSchema, imageUrl: z.string().nullable(), vignette: z.boolean().optional() }))
    .optional(),
  /** Its texts, each tied to a frame (older APIs leave them out: the text as one narration). */
  texts: z
    .array(z.object({ id: z.string(), kind: TextKindSchema, frame: z.number().int(), speaker: z.string().nullable(), text: z.string() }))
    .optional(),
});
export type BookPage = z.infer<typeof BookPageSchema>;

/** What the API returns for a book. */
export const BookSchema = z.object({
  id: z.string(),
  status: BookStatusSchema,
  progress: z.number().min(0).max(100),
  title: z.string().nullable(),
  language: LanguageSchema,
  /** The child's name, for the cover. */
  childName: z.string(),
  methodology: z.string(),
  /** The story format it is made in (StoryFormat slug; older APIs leave it out: the picture book). */
  format: z.string().default("picture-book"),
  /** Catalog book slug, or null for a book of your own. */
  template: z.string().nullable(),
  talkQuestions: z.array(z.string()),
  heroImageUrl: z.string().nullable(),
  /** The front cover's own illustration (the hero in a scene from the story); null for books made before it. */
  coverImageUrl: z.string().nullable().default(null),
  /** The back cover's two sentences, in the book's language; null for books made before it. */
  blurb: z.string().nullable().default(null),
  /** The toy photo the parent sent, the toy SAM cut out of it, and its character sheet. */
  toy: z
    .object({
      name: z.string().nullable(),
      photoUrl: z.string(),
      cutoutUrl: z.string().nullable(),
      sheetUrl: z.string().nullable(),
    })
    .nullable(),
  pages: z.array(BookPageSchema),
  pdfUrl: z.string().nullable(),
  error: z.string().nullable(),
  /** How the book is laid out and printed (the theme, each page's layout, render QA). */
  layout: BookLayoutSchema,
  /** The visitor may still change the layout: their book, finished, not yet ordered. */
  editable: z.boolean(),
  /** While the book is being made: its steps, pages drawn and time left; null once done or failed (older APIs leave it out). */
  generation: GenerationViewSchema.nullable().optional(),
  createdAt: z.string(),
});
export type Book = z.infer<typeof BookSchema>;

/** A book's pages from the API as the renderer takes them: panel pages keep their frames and texts. */
export function renderablePages(pages: Book["pages"]): RenderablePage[] {
  return pages.map((p) => ({
    page: p.page,
    text: p.text,
    image: p.imageUrl,
    ...(p.frames && { frames: p.frames.map((f) => ({ frame: f.frame, rect: f.rect, image: f.imageUrl })) }),
    ...(p.texts && { texts: p.texts.map((t) => ({ id: t.id, kind: t.kind, frame: t.frame, text: t.text })) }),
  }));
}

/**
 * Body of PATCH /books/:id/layout (the parent, before ordering): another theme, and the parent's
 * pick among each story page's layouts (by page number; null goes back to the automatic one).
 */
export const UpdateLayoutSchema = z.object({
  /** A curated theme's id, or a published AI theme's (the API checks). */
  theme: z.string().trim().min(1).max(60).optional(),
  choices: z.record(z.string().regex(/^\d{1,3}$/), PageVariantSchema.nullable()).optional(),
  /** The blocks in the parent's order, by kind (the API keeps the template's rules). */
  blocks: z.array(BlockKindSchema).min(3).max(12).optional(),
  /** The parent's dedication; null goes back to the default one. */
  dedication: DedicationSchema.nullable().optional(),
  /** The caption under the parent's photo; null takes it away. */
  photoCaption: PhotoCaptionSchema.nullable().optional(),
  /** A published print format's id: the book is laid out again at that size. */
  format: z.string().trim().min(1).max(40).optional(),
});
export type UpdateLayout = z.infer<typeof UpdateLayoutSchema>;

/**
 * Body of POST /books/:id/photo: the parent's photo of the child as a data URL of the file as picked
 * (JPEG, PNG or HEIC, at most PHOTO_MAX_BYTES). The API checks the bytes, not the declared type,
 * re-encodes it as JPEG without metadata and adds the photo page.
 */
export const PhotoUploadSchema = z.object({
  image: z
    .string()
    .regex(/^data:[\w.+/-]*;base64,[A-Za-z0-9+/=]+$/, "A base64 data URL")
    .max(Math.ceil((PHOTO_MAX_BYTES * 4) / 3) + 100),
  caption: PhotoCaptionSchema.optional(),
});
export type PhotoUpload = z.infer<typeof PhotoUploadSchema>;
/** Body of a 400 from POST /books/:id/photo: `reason` is "type" (not a JPEG, PNG or HEIC), "size" or "decode". */
export const PHOTO_REFUSED = "photo_refused";
export const PHOTO_REFUSALS = ["type", "size", "decode"] as const;
export type PhotoRefusal = (typeof PHOTO_REFUSALS)[number];

/** Body of PATCH /admin/books/:id/layout: staff pin a page's layout (null unpins), or change the theme. */
export const PinLayoutSchema = z.object({
  theme: z.string().trim().min(1).max(60).optional(),
  pins: z.record(z.string().regex(/^\d{1,3}$/), PageVariantSchema.nullable()).optional(),
});
export type PinLayout = z.infer<typeof PinLayoutSchema>;

/** Body of a 409 from PATCH /books/:id/layout: the book is ordered, its layout is frozen. */
export const LAYOUT_LOCKED = "layout_locked";
/** Body of a 409 from POST /orders: render QA found text that does not fit, so it is not printed. */
export const PRINT_BLOCKED = "print_blocked";

/** A row of "My books": what this browser has made. */
export const MyBookSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  status: BookStatusSchema,
  childName: z.string(),
  language: LanguageSchema,
  heroImageUrl: z.string().nullable(),
  createdAt: z.string(),
});
export type MyBook = z.infer<typeof MyBookSchema>;

/**
 * A finished book on the home page's examples (GET /books/examples), in the page's language: an
 * example's version in that language, or, when no example has one, a catalog book's sample.
 */
export const ExampleBookSchema = z.object({
  id: z.string(),
  title: z.string(),
  language: LanguageSchema,
  heroImageUrl: z.string().nullable(),
  /** "example": a version of an example staff set up; "sample": a catalog book's sample filling in. */
  kind: z.enum(["example", "sample"]).default("example"),
});
export type ExampleBook = z.infer<typeof ExampleBookSchema>;

/**
 * GET /sitemap: what the site's sitemap lists besides its fixed pages: every published catalog book
 * and every example book staff picked, wherever they are shown, with when each last changed (ISO).
 */
export const SitemapEntriesSchema = z.object({
  templates: z.array(z.object({ slug: z.string(), updatedAt: z.string() })),
  /** Every finished version of every example: a public page in its own language only. */
  examples: z.array(
    z.object({
      id: z.string(),
      updatedAt: z.string(),
      /** For the book page's title and OG image (older APIs leave them out). */
      title: z.string().nullable().optional(),
      heroImageUrl: z.string().nullable().optional(),
      /** The book's language: its page is listed in that language version of the site only. */
      language: LanguageSchema.optional(),
      /** The same story's finished versions, book id by language (this one included): its hreflang alternates. */
      versions: z.partialRecord(LanguageSchema, z.string()).optional(),
    }),
  ),
});
export type SitemapEntries = z.infer<typeof SitemapEntriesSchema>;

/** GET /status: what visitors are told before they fill in the form. */
export const ServiceStatusSchema = z.object({
  /** New books are not being created (paused in the admin). */
  paused: z.boolean(),
  /** The form can be filled in by voice (POST /voice; VOICE_INPUT on the API). */
  voice: z.boolean(),
});
export type ServiceStatus = z.infer<typeof ServiceStatusSchema>;

/** Progress shown for each stage while the book is generating. */
export function progressFor(status: BookStatus, pagesDone = 0, pagesTotal = 0): number {
  switch (status) {
    case "queued":
      return 0;
    case "toy":
      return 5;
    case "story":
      return 10;
    case "hero":
      return 25;
    case "pages":
      return pagesTotal ? 30 + Math.round((60 * pagesDone) / pagesTotal) : 30;
    case "pdf":
      return 95;
    case "done":
      return 100;
    case "failed":
      return 0;
  }
}

/** Body of POST /toys: a JPEG photo as a data URL, already scaled down in the browser. */
export const ToyUploadSchema = z.object({
  image: z
    .string()
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/, "Нужна фотография в формате JPEG")
    .max(8_000_000, "Фотография слишком большая"),
});
export const ToyUploadResultSchema = z.object({ upload: z.string() });

// ---- Voice input -------------------------------------------------------------

/** Fields of POST /voice next to the `audio` file (a 16 kHz mono WAV, at most 60 s). */
export const VoiceRequestSchema = z.object({
  /** The interface language; the parent speaks it and the template's options are in it. */
  language: LanguageSchema,
  /** Catalog book slug when the parent is on its form; then `answers` are filled in. */
  template: z.string().min(1).max(80).optional(),
});
export type VoiceRequest = z.infer<typeof VoiceRequestSchema>;

/**
 * What the parent's recording filled in. Only fields the parent actually said are present, each
 * valid for the form; `answers` hold exact option strings of the template's choice questions.
 */
export const VoicePrefillSchema = z.object({
  transcript: z.string(),
  child: ChildProfileSchema.omit({ language: true }).partial(),
  toyName: z.string().trim().min(1).max(40).optional(),
  /** What a book of your own is about (no template). */
  theme: z.string().trim().min(3).max(200).optional(),
  /** Answers to the template's questions, by question key. */
  answers: AnswersSchema.optional(),
});
export type VoicePrefill = z.infer<typeof VoicePrefillSchema>;

/** Body of a 404 from POST /voice when voice input is off (VOICE_INPUT). */
export const VOICE_DISABLED = "voice_disabled";
/** Body of a 429 from POST /voice: too many recordings from this visitor in the last hour. */
export const VOICE_RATE_LIMITED = "voice_rate_limited";
/** Body of a 502 from POST /voice: the speech or language model could not be reached. */
export const VOICE_FAILED = "voice_failed";

// ---- Free limit and purchased books ------------------------------------------

/** A catalog book (an adaptation of a ready plot) or a story of your own, written from scratch. */
export const BOOK_KINDS = ["template", "custom"] as const;
export const BookKindSchema = z.enum(BOOK_KINDS);
export type BookKind = z.infer<typeof BookKindSchema>;

/**
 * What one more generated (digital) book of this kind costs a visitor from `country`, in the
 * country's currency (reference.countries; "other" pays in dollars): the country's own book prices
 * when it has them in that currency, else the currency's default (reference.prices). Null when the
 * currency has no prices at all.
 */
export function bookPrice(kind: BookKind, country: Country, data: Pick<PricingData, "prices" | "countries" | "countryPrices">): Money | null {
  return bookPricesFor(country, data)?.[kind] ?? null;
}

/** Body of a 409 from a purchase or an order: the visitor's currency has no price for it. */
export const PRICE_UNSET = "price_unset";

/** Body of a 503 from a purchase or an order: the country's payment provider is not wired in yet. */
export const PAYMENT_UNAVAILABLE = "payment_unavailable";

/** An email a parent typed: for order and receipt emails. */
export const EmailSchema = z.string().trim().max(200).pipe(z.email("Проверьте адрес почты"));

/** Body of POST /quota/purchase. The email (else the signed-in parent's) gets a receipt. */
export const PurchaseSchema = z.object({
  kind: BookKindSchema,
  email: EmailSchema.optional(),
  locale: LanguageSchema.optional(),
});
export type Purchase = z.infer<typeof PurchaseSchema>;

export const QuotaSchema = z.object({
  /** Books this visitor has generated (failed ones are not counted). */
  used: z.number().int(),
  /** Free books plus purchased ones. */
  limit: z.number().int(),
  remaining: z.number().int(),
  /** A demo code (for judges) lifts the per-visitor limit. */
  demo: z.boolean(),
});
export type Quota = z.infer<typeof QuotaSchema>;

/** Body of a 402 from POST /books. */
export const LIMIT_REACHED = "limit_reached";
/** Body of a 503 from POST /books when the service-wide daily cap is hit. */
export const DAILY_CAP_REACHED = "daily_cap_reached";
/** Body of a 503 from POST /books once model spend reaches MODEL_BUDGET_USD. */
export const BUDGET_REACHED = "budget_reached";
/** Body of a 451 from any route: the visitor is in a country where Meta's models may not be offered. */
export const REGION_UNAVAILABLE = "region_unavailable";

// ---- Printed book orders -------------------------------------------------------

export const COVERS = ["soft", "hard"] as const;
export const CoverSchema = z.enum(COVERS);
export type Cover = z.infer<typeof CoverSchema>;

export const CreateOrderSchema = z.object({
  bookId: z.string().min(1),
  recipientName: z.string().trim().min(2).max(80),
  /** A mobile number with its country code: + and 8 to 15 digits (spaces, brackets and dashes are dropped). */
  phone: z
    .string()
    .transform((s) => s.replace(/[\s()-]/g, ""))
    .pipe(z.string().regex(/^\+\d{8,15}$/, "A number with its country code: +7 701 123 45 67")),
  /** The confirmation and status emails go here. */
  email: EmailSchema,
  /** A delivery city's id (reference.cities); the order keeps its Russian name too. */
  cityId: z.string().trim().min(1).max(60),
  address: z.string().trim().min(5).max(200),
  cover: CoverSchema,
  /** A published print format's id (reference.formats); the book's current format when left out. */
  format: z.string().trim().min(1).max(40).optional(),
  quantity: z.coerce.number().int().min(1).max(5),
  /** Language of the emails; the book's language when left out. */
  locale: LanguageSchema.optional(),
});
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;

/** One line of a printed order: a book in a format and cover, how many, and the price of one and of all. */
export interface QuoteLine {
  bookId: string;
  format: string;
  cover: Cover;
  quantity: number;
  unit: Money;
  total: Money;
  /** The print partner's cost of one copy, when set (any currency). */
  unitCost: Money | null;
}

/** What a printed order costs, all in the country's currency: its lines, delivery and the total. */
export interface OrderQuote {
  currency: Currency;
  lines: QuoteLine[];
  subtotal: Money;
  delivery: Money;
  total: Money;
  /** The print partner's delivery cost, when set and delivery is charged for. */
  deliveryCost: Money | null;
}

/**
 * What a printed order costs at the owner's prices, in the country's currency: the copies of the
 * book in the format and cover, plus the flat delivery fee unless delivery is free everywhere in the
 * country or the city (by id) is one with free delivery. Throws for a format with no price in that
 * currency or a currency without a delivery fee (the API refuses such an order first).
 */
export function quoteOrder(input: {
  bookId: string;
  format: LocalFormat;
  cover: Cover;
  quantity: number;
  cityId: string;
  delivery: { fee: Money | null; freeEverywhere?: boolean; cost?: Money | null };
  cities: readonly City[];
}): OrderQuote {
  const { format, cover, quantity, delivery } = input;
  if (!format.prices) throw new Error(`Format ${format.id} has no price here`);
  const unit = format.prices[cover];
  const currency = unit.currency;
  const free = delivery.freeEverywhere === true || input.cities.some((c) => c.freeDelivery && c.id === input.cityId);
  if (!free && !delivery.fee) throw new Error(`No delivery fee in ${currency}`);
  const fee = free ? money(0, currency) : delivery.fee!;
  if (fee.currency !== currency) throw new Error(`Delivery is priced in ${fee.currency}, the format in ${currency}`);
  const line: QuoteLine = {
    bookId: input.bookId,
    format: format.id,
    cover,
    quantity,
    unit,
    total: multiplyMoney(unit, quantity),
    unitCost: format.cost?.[cover] ?? null,
  };
  const subtotal = line.total;
  return {
    currency,
    lines: [line],
    subtotal,
    delivery: fee,
    total: money(subtotal.amount + fee.amount, currency),
    deliveryCost: free ? null : (delivery.cost ?? null),
  };
}

/** Body of a 400 from POST /orders: the city is not one we deliver to (reference.cities). */
export const CITY_UNKNOWN = "city_unknown";

/**
 * Body of a 400 from POST /orders: the visitor's country has no print (reference.countries), so
 * nothing can be ordered there; the site offers a print-interest request instead.
 */
export const PRINT_UNAVAILABLE = "print_unavailable";

/** Delivery stages, in order. The demo walks through them on a timer. */
export const ORDER_STATUSES = ["paid", "printing", "shipped", "delivered"] as const;
export const OrderStatusSchema = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

/** A stage an order reached and when (ISO time); the admin may add a note. */
export const OrderStatusEventSchema = z.object({
  status: OrderStatusSchema,
  at: z.string(),
  note: z.string().nullable(),
});
export type OrderStatusEvent = z.infer<typeof OrderStatusEventSchema>;

/** Where a payment stands with its provider; a manual (demo) payment is paid at once. */
export const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded"] as const;
export const PaymentStatusSchema = z.enum(PAYMENT_STATUSES);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

/** A line of an order as it was priced when ordered: never repriced. */
export const OrderLineSchema = z.object({
  bookId: z.string(),
  /** The format's id; null for orders made before formats. */
  format: z.string().nullable(),
  cover: CoverSchema,
  quantity: z.number().int(),
  unit: MoneySchema,
  total: MoneySchema,
});
export type OrderLine = z.infer<typeof OrderLineSchema>;

export const OrderSchema = z.object({
  id: z.string(),
  bookId: z.string(),
  bookTitle: z.string().nullable(),
  /** The book's hero picture, a thumbnail for the order. */
  bookImageUrl: z.string().nullable(),
  status: OrderStatusSchema,
  /** Stages reached, oldest first (the demo timer's stages included while it runs the order). */
  history: z.array(OrderStatusEventSchema),
  recipientName: z.string(),
  /** The phone with all but the last four digits hidden: "+7 *** *** 45 67". */
  phoneMasked: z.string(),
  email: z.string(),
  /** The city's Russian name when ordered. */
  city: z.string(),
  /** Its id in reference.cities; null for orders made before cities had ids. */
  cityId: z.string().nullable(),
  address: z.string(),
  cover: CoverSchema,
  /** The printed size, from the layout frozen with the order; null for orders made before formats. */
  format: z.object({ id: z.string(), widthMm: z.number(), heightMm: z.number(), bleedMm: z.number() }).nullable(),
  quantity: z.number().int(),
  /** What it was priced and paid in: the country's currency when ordered. */
  currency: CurrencySchema,
  lines: z.array(OrderLineSchema),
  subtotal: MoneySchema,
  delivery: MoneySchema,
  total: MoneySchema,
  payment: z.object({ provider: PaymentProviderSchema, status: PaymentStatusSchema }),
  createdAt: z.string(),
});
export type Order = z.infer<typeof OrderSchema>;

/** A phone with all but its last four digits hidden: "+77011234567" → "+7 *** *** 45 67". */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  const tail = digits.slice(-4);
  const prefix = phone.trim().startsWith("+") && digits.length > 10 ? `+${digits.slice(0, digits.length - 10)} ` : "";
  return `${prefix}*** *** ${tail.slice(0, 2)} ${tail.slice(2)}`;
}

/**
 * The date each stage was reached, from an order's history: the latest time it was set, for stages up
 * to the current one (a stage after it, left by a step back in the admin, is not reached). The first
 * stage is the order's own time when its history has none.
 */
export function orderTimeline(order: Pick<Order, "status" | "history" | "createdAt">): { status: OrderStatus; at: string | null; reached: boolean }[] {
  const current = ORDER_STATUSES.indexOf(order.status);
  return ORDER_STATUSES.map((status, index) => {
    const reached = index <= current;
    const last = [...order.history].reverse().find((e) => e.status === status);
    const at = reached ? (last?.at ?? (index === 0 ? order.createdAt : null)) : null;
    return { status, at, reached };
  });
}

/** Stage an order has reached `elapsedMs` after it was paid, given the time each stage takes. */
export function orderStatusAt(elapsedMs: number, stageMs: number): OrderStatus {
  const index = Math.min(Math.floor(elapsedMs / stageMs), ORDER_STATUSES.length - 1);
  return ORDER_STATUSES[Math.max(index, 0)];
}

// ---- Admin ---------------------------------------------------------------------

/** Body of a 503 from POST /books while generation is paused in the admin. */
export const GENERATION_PAUSED = "generation_paused";

/** Body of a 404 from POST /admin/login: password sign-in is off (ADMIN_PASSWORD_LOGIN), use Keycloak. */
export const PASSWORD_LOGIN_DISABLED = "password_login_disabled";

/** GET /admin/login-options: which ways into the admin are on. */
export const AdminLoginOptionsSchema = z.object({ password: z.boolean(), keycloak: z.boolean() });
export type AdminLoginOptions = z.infer<typeof AdminLoginOptionsSchema>;

export const AdminLoginSchema = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(1),
});
export type AdminLogin = z.infer<typeof AdminLoginSchema>;

export const PauseSchema = z.object({ paused: z.boolean() });

export const AdminStatsSchema = z.object({
  paused: z.boolean(),
  books: z.object({
    total: z.number().int(),
    today: z.number().int(),
    byStatus: z.record(z.string(), z.number().int()),
    /** Done out of finished (done + failed), 0..1; null before any book finishes. */
    successRate: z.number().nullable(),
    /** Average seconds from order to finished PDF. */
    avgSeconds: z.number().nullable(),
  }),
  spend: z.object({ totalUsd: z.number(), todayUsd: z.number(), budgetUsd: z.number() }),
  caps: z.object({
    regular: z.object({ used: z.number().int(), limit: z.number().int() }),
    demo: z.object({ used: z.number().int(), limit: z.number().int() }),
  }),
  /** Revenue in each currency as charged, and roughly in dollars at each sale's own rate. */
  sales: z.object({
    orders: RevenueSchema,
    /** Purchases of more books; `books` is how many books they bought. */
    purchases: RevenueSchema.extend({ books: z.number().int() }),
    /** Orders and purchases together, roughly in dollars. */
    approxUsd: MoneySchema,
  }),
  countries: z.array(z.object({ country: z.string(), books: z.number().int() })),
  /** Requests for a printed book from countries without a print partner. */
  printInterest: z.array(z.object({ country: z.string().nullable(), requests: z.number().int() })),
  templates: z.array(z.object({ slug: z.string().nullable(), title: z.string(), books: z.number().int() })),
  /** Staff generation today by country (null: for no country), with each one's cap. */
  staffSpend: z.array(z.object({ country: z.string().nullable(), usd: z.number(), capUsd: z.number().nullable() })).default([]),
});
export type AdminStats = z.infer<typeof AdminStatsSchema>;

export const AdminBookRowSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  status: BookStatusSchema,
  childName: z.string(),
  language: LanguageSchema,
  methodology: z.string(),
  template: z.string().nullable(),
  country: z.string().nullable(),
  demo: z.boolean(),
  /** A version of a home page example. */
  example: z.boolean(),
  costUsd: z.number(),
  orders: z.number().int(),
  createdAt: z.string(),
});
export type AdminBookRow = z.infer<typeof AdminBookRowSchema>;

/** One binding's cover wrap as the admin shows it: the spine's width and the wrap's finished size. */
export const PrintWrapSchema = z.object({
  spineMm: z.number(),
  spineText: z.boolean(),
  widthMm: z.number(),
  heightMm: z.number(),
});

export const AdminBookSchema = BookSchema.extend({
  child: ChildProfileSchema,
  theme: z.string().nullable(),
  answers: AnswersSchema.nullable(),
  country: z.string().nullable(),
  demo: z.boolean(),
  /** The home page example it is a version of, and in which language; null when it is none. */
  example: z.object({ id: z.string(), language: LanguageSchema }).nullable(),
  costUsd: z.number(),
  clientKey: z.string(),
  /** How it prints: the pages between the covers and the cover wrap of each binding (older APIs leave it out). */
  print: z
    .object({
      interiorPages: z.number().int(),
      soft: PrintWrapSchema,
      hard: PrintWrapSchema,
    })
    .optional(),
});
export type AdminBook = z.infer<typeof AdminBookSchema>;

export const AdminOrderSchema = OrderSchema.extend({
  phone: z.string(),
  /** The country it was ordered from (ISO code); null for an order whose country is not known (global staff only). */
  country: z.string().nullable().default(null),
  /** True when the status was set by hand rather than by the demo timer. */
  manual: z.boolean(),
  /** Dollars for one unit of the order's currency when it was placed (reports only); null when no rate was known. */
  fxToUsd: z.string().nullable().default(null),
});
export type AdminOrder = z.infer<typeof AdminOrderSchema>;

export const UpdateOrderStatusSchema = z.object({
  status: OrderStatusSchema,
  /** Shown to the parent next to the stage, e.g. a tracking number. */
  note: z.string().trim().max(200).optional(),
});

/** A template's sample book in one language, by language. */
export const TemplateSamplesSchema = z.partialRecord(LanguageSchema, z.string());
export type TemplateSamples = z.infer<typeof TemplateSamplesSchema>;

/** A finished book from a template that staff may pick as its sample in the book's language. */
export const SampleOptionSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  childName: z.string(),
  language: LanguageSchema,
  /** The country it was made in (a country's sample is picked among its books). */
  country: z.string().nullable().default(null),
  createdAt: z.string(),
});
export type SampleOption = z.infer<typeof SampleOptionSchema>;

/** A template's samples for single countries: by country code, the sample book per language. */
export const CountrySamplesSchema = z.record(z.string(), TemplateSamplesSchema);
export type CountrySamples = z.infer<typeof CountrySamplesSchema>;

export const AdminTemplateSchema = TemplateSchema.omit({ sampleDetails: true, sampleBookId: true, sampleLanguage: true }).extend({
  /** The global sample book per language (shown where a country has none of its own). */
  samples: TemplateSamplesSchema,
  /** Countries' own samples, which their visitors see before the global ones. */
  countrySamples: CountrySamplesSchema.default({}),
  /** Finished books from this template, newest first: the ones staff may pick as samples. */
  sampleOptions: z.array(SampleOptionSchema),
  published: z.boolean(),
  sortOrder: z.number().int(),
  theme: z.string(),
  plot: z.array(z.string()),
  stylePrompt: z.string().nullable(),
  /** The theme books from this template get; null: by the child's age. */
  layoutTheme: z.string().nullable(),
  /** The blocks its books get; null: the default ones (DEFAULT_BLOCKS). */
  blocks: TemplateBlocksSchema.nullable(),
  /** Country codes (reference.countries) the catalog lists it in, or leaves it out of (`countriesMode`); empty: everywhere. */
  countries: z.array(z.string()),
  countriesMode: CountriesModeSchema.default("include"),
  books: z.number().int(),
});
export type AdminTemplate = z.infer<typeof AdminTemplateSchema>;

/** Body of PUT /admin/templates/:slug/visibility: show or hide the catalog book in one country. */
export const TemplateVisibilitySchema = z.object({ country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/), visible: z.boolean() });
export type TemplateVisibility = z.infer<typeof TemplateVisibilitySchema>;

/** Body of PUT /admin/templates/:slug/samples: a sample for one language, global (country null) or one country's. */
export const TemplateSampleSchema = z.object({
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).nullable(),
  language: LanguageSchema,
  /** A finished book from this template in that language, or null to clear it. */
  bookId: z.string().min(1).max(40).nullable(),
});
export type TemplateSample = z.infer<typeof TemplateSampleSchema>;

/**
 * Body code of a 409 from PUT /admin/templates/:slug/visibility: hiding the catalog book in its
 * only listed country would list it everywhere; only global staff may (unpublish it instead).
 */
export const CATALOG_LAST_COUNTRY = "catalog_last_country";

/** Body code of a 409 from PUT /admin/templates/:slug/samples: the book is a sample somewhere else already. */
export const SAMPLE_TAKEN = "sample_taken";

export const UpdateTemplateSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    summary: z.string().trim().min(1).max(400),
    ageMin: z.number().int().min(CHILD_AGE_MIN).max(CHILD_AGE_MAX),
    ageMax: z.number().int().min(CHILD_AGE_MIN).max(CHILD_AGE_MAX),
    methodology: MethodologySlugSchema,
    theme: z.string().trim().min(3).max(300),
    plot: z.array(z.string().trim().min(3).max(300)).min(3).max(12),
    questions: z.array(TemplateQuestionSchema).max(8),
    stylePrompt: z.string().trim().max(400).nullable(),
    /** One of the themes that cover all the template's languages, or null to pick by age. */
    layoutTheme: z.string().trim().min(1).max(60).nullable(),
    /** The blocks its books get and which optional ones the parent may add; null: the default ones. */
    blocks: TemplateBlocksSchema.nullable(),
    /**
     * Samples to change, by language: a finished book from this template in that language to show
     * on its page, or null for none there. Languages left out keep theirs.
     */
    samples: z.partialRecord(LanguageSchema, z.string().min(1).nullable()),
    /**
     * Where the catalog lists it: codes from reference.countries (the API refuses others), or
     * empty for everywhere. Its page opens from anywhere by a direct link.
     */
    countries: TemplateCountriesSchema,
    /** Whether `countries` are the only ones it is listed in (include) or the ones it is left out of (exclude). */
    countriesMode: CountriesModeSchema,
    published: z.boolean(),
    sortOrder: z.number().int(),
  })
  .partial();
export type UpdateTemplate = z.infer<typeof UpdateTemplateSchema>;

// ---- Journal (admin) ---------------------------------------------------------------

/** What a model call was for: one per ModelGateway method. */
export const MODEL_CALL_KINDS = [
  "story",
  "review",
  "toy-cutout",
  "toy-describe",
  "toy-sheet",
  "hero",
  "pet",
  "page",
  "voice-transcribe",
  "voice-extract",
  /** SAM finds the hero in a page illustration, for the page layout. */
  "page-mask",
  /** Render QA in Chromium while making the PDF; an error when the book cannot be printed. */
  "render",
  /** Muse Spark proposes a book theme from the owner's brief (admin «Темы»). */
  "theme",
  /** Muse Image draws an AI theme's ornament. */
  "ornament",
  /** Muse Spark translates an example book into another language (admin «Examples»). */
  "translate",
  /** Muse Spark shortens a translated page whose text does not fit the layout. */
  "shorten",
  /** Muse Spark rewrites a page's scene that Muse Image refused twice, so it can be drawn safely. */
  "scene-rewrite",
  /** Muse Image draws the front cover's illustration, chained from the character sheets. */
  "cover",
  /** SAM finds the characters on the cover illustration, so the lettering keeps off them. */
  "cover-mask",
  /** Muse Image draws a side character's sheet (a story format with cast sheets), chained from the hero's. */
  "cast",
] as const;
export const ModelCallKindSchema = z.enum(MODEL_CALL_KINDS);
export type ModelCallKind = z.infer<typeof ModelCallKindSchema>;

export const MODEL_CALL_STATUSES = ["ok", "error"] as const;
export const ModelCallStatusSchema = z.enum(MODEL_CALL_STATUSES);
export type ModelCallStatus = z.infer<typeof ModelCallStatusSchema>;

/** How far back the journal looks. */
export const JOURNAL_PERIODS = ["24h", "7d", "30d"] as const;
export const JournalPeriodSchema = z.enum(JOURNAL_PERIODS);
export type JournalPeriod = z.infer<typeof JournalPeriodSchema>;

export const ModelCallSchema = z.object({
  id: z.string(),
  bookId: z.string().nullable(),
  kind: ModelCallKindSchema,
  model: z.string(),
  status: ModelCallStatusSchema,
  /** 1 for the first try; our own retries (a story that was not valid JSON) count up. */
  attempt: z.number().int(),
  latencyMs: z.number().int(),
  inputTokens: z.number().int().nullable(),
  outputTokens: z.number().int().nullable(),
  images: z.number().int(),
  costUsd: z.number(),
  responseId: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  /** Illustrator references (their ids) sent with the call as pictures. */
  references: z.array(z.string()).default([]),
  /** The pipeline step it was made for (PIPELINE_STEP_IDS), and the page and frame; null before steps were kept. */
  step: PipelineStepIdSchema.nullable().default(null).catch(null),
  page: z.number().int().nullable().default(null),
  frame: z.number().int().nullable().default(null),
  createdAt: z.string(),
});
export type ModelCall = z.infer<typeof ModelCallSchema>;

/** GET /admin/journal/calls/:id. The prompt and output are kept for failed calls only, for 30 days. */
export const ModelCallDetailSchema = ModelCallSchema.extend({
  prompt: z.string().nullable(),
  output: z.string().nullable(),
  bookTitle: z.string().nullable(),
});
export type ModelCallDetail = z.infer<typeof ModelCallDetailSchema>;

/** Query of GET /admin/journal/calls. */
export const JournalCallsQuerySchema = z.object({
  kind: ModelCallKindSchema.optional(),
  status: ModelCallStatusSchema.optional(),
  period: JournalPeriodSchema.default("24h"),
  /** The last call id of the previous page. */
  cursor: z.string().min(1).max(40).optional(),
});
export type JournalCallsQuery = z.infer<typeof JournalCallsQuerySchema>;

/** GET /admin/journal/calls: newest first; `nextCursor` is null on the last page. */
export const ModelCallPageSchema = z.object({
  calls: z.array(ModelCallSchema),
  nextCursor: z.string().nullable(),
});
export type ModelCallPage = z.infer<typeof ModelCallPageSchema>;

export const JournalPeriodQuerySchema = z.object({ period: JournalPeriodSchema.default("24h") });

/** GET /admin/journal/stats. Latencies are in milliseconds; null when there were no calls. */
export const JournalStatsSchema = z.object({
  period: JournalPeriodSchema,
  calls: z.number().int(),
  errors: z.number().int(),
  costUsd: z.number(),
  clientErrors: z.number().int(),
  byModel: z.array(
    z.object({
      kind: ModelCallKindSchema,
      model: z.string(),
      calls: z.number().int(),
      errors: z.number().int(),
      p50Ms: z.number().nullable(),
      p95Ms: z.number().nullable(),
      avgCostUsd: z.number(),
    }),
  ),
});
export type JournalStats = z.infer<typeof JournalStatsSchema>;

export const CLIENT_ERROR_KINDS = ["js", "api", "unhandled"] as const;
export const ClientErrorKindSchema = z.enum(CLIENT_ERROR_KINDS);
export type ClientErrorKind = z.infer<typeof ClientErrorKindSchema>;

/**
 * Body of POST /telemetry/error: an error a visitor saw. Never form values, names or the query
 * string: the message, the page path and the API's error code are enough to find the bug.
 */
export const ClientErrorReportSchema = z.object({
  kind: ClientErrorKindSchema,
  message: z.string().trim().min(1).max(500),
  /** location.pathname, without the query string. */
  path: z.string().trim().min(1).max(200),
  code: z.string().trim().min(1).max(60).optional(),
  status: z.number().int().min(0).max(999).optional(),
  locale: z.string().trim().min(2).max(10).optional(),
});
export type ClientErrorReport = z.infer<typeof ClientErrorReportSchema>;

/** GET /admin/journal/errors: errors grouped by message and page, the latest first. */
export const ClientErrorGroupSchema = z.object({
  message: z.string(),
  path: z.string(),
  count: z.number().int(),
  lastSeen: z.string(),
  recent: z.array(
    z.object({
      id: z.string(),
      kind: ClientErrorKindSchema,
      code: z.string().nullable(),
      status: z.number().int().nullable(),
      locale: z.string().nullable(),
      userAgent: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
});
export type ClientErrorGroup = z.infer<typeof ClientErrorGroupSchema>;

// ---- Sign-in (Keycloak) -------------------------------------------------------------

/** The signed-in parent, from the session cookie (email and name live in Keycloak, not our DB). */
export const AuthUserSchema = z.object({
  email: z.string().nullable(),
  name: z.string().nullable(),
  /** A superadmin (the admin role in Team, or the Keycloak realm role `admin`). */
  admin: z.boolean(),
  /** Staff but not a superadmin (e.g. SEO, a country manager): the admin opens on their sections only. */
  seo: z.boolean().default(false),
  /** May open the admin at all (any role). */
  staff: z.boolean().default(false),
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

/** GET /auth/me. `enabled` is false when neither Keycloak nor the test provider is configured. */
export const AuthMeSchema = z.object({ enabled: z.boolean(), user: AuthUserSchema.nullable() });
export type AuthMe = z.infer<typeof AuthMeSchema>;

/** POST /auth/logout: where to send the browser to end the Keycloak session too. */
export const AuthLogoutSchema = z.object({ url: z.string() });
export type AuthLogout = z.infer<typeof AuthLogoutSchema>;

/** The `auth` query parameter the callback adds to the return path when sign-in failed. */
export const AUTH_ERROR = "error";

// ---- Book themes (admin «Темы») ----------------------------------------------------------------

/**
 * A theme as the admin lists it: a curated one from code (always published, no checks), or one
 * Muse Spark proposed, with the checks it passed and its sample pages by language (image URLs).
 */
export const AdminThemeSchema = z.object({
  theme: BookThemeSchema,
  status: z.enum(["draft", "published"]),
  brief: z.string().nullable(),
  checks: z.array(ThemeCheckSchema),
  previews: z.partialRecord(LanguageSchema, z.array(z.string())),
  createdAt: z.string().nullable(),
});
export type AdminTheme = z.infer<typeof AdminThemeSchema>;

/** Body of a 422 from POST /admin/themes: the proposal failed a check; `checks` says which and why. */
export const THEME_REFUSED = "theme_refused";
export const ThemeRefusalSchema = z.object({ code: z.literal(THEME_REFUSED), message: z.string(), checks: z.array(ThemeCheckSchema) });
export type ThemeRefusal = z.infer<typeof ThemeRefusalSchema>;
