import { z } from "zod";
import { LANGUAGES, LanguageSchema, type Language } from "./language";

// ---- The hero's look: picked with buttons, or described by Muse Spark from the child's photo --------
//
// Both paths end in the same small, closed set of values: a skin tone, hair colour, length and
// texture, eye colour, a face shape, glasses and freckles. Nothing else is kept or sent on: whatever a
// model adds (an ethnicity, an age guess, anything sensitive) is dropped by the schema, and the
// sentence the illustrator reads is built here from these values only (lookSentence).

/** Skin tones as swatches, light to deep. The photo path maps Muse Spark's colour to the nearest one. */
export const SKIN_TONES = [
  { id: "fair", hex: "#F3D9C6" },
  { id: "light", hex: "#EBC3A3" },
  { id: "light-medium", hex: "#D9A47F" },
  { id: "medium", hex: "#C68A62" },
  { id: "tan", hex: "#A86E48" },
  { id: "brown", hex: "#8A5536" },
  { id: "dark-brown", hex: "#6B3F27" },
  { id: "deep", hex: "#4A2C1D" },
] as const;
export type SkinTone = (typeof SKIN_TONES)[number]["id"];

export const HAIR_COLORS = [
  { id: "black", hex: "#1F1A17" },
  { id: "dark-brown", hex: "#3B2A20" },
  { id: "brown", hex: "#6A4A32" },
  { id: "light-brown", hex: "#9A7552" },
  { id: "blond", hex: "#D8B878" },
  { id: "red", hex: "#B0502A" },
] as const;
export type HairColor = (typeof HAIR_COLORS)[number]["id"];

export const HAIR_LENGTHS = ["very-short", "short", "chin", "shoulder", "long"] as const;
export const HAIR_TEXTURES = ["straight", "wavy", "curly", "coily"] as const;
export const EYE_COLORS = [
  { id: "dark-brown", hex: "#3B2416" },
  { id: "brown", hex: "#6B4226" },
  { id: "hazel", hex: "#8E7240" },
  { id: "green", hex: "#5E7F4A" },
  { id: "blue", hex: "#5B83B0" },
  { id: "gray", hex: "#8A949C" },
] as const;
export type EyeColor = (typeof EYE_COLORS)[number]["id"];
/** Only the photo path names a face shape; the buttons leave it to the illustrator. */
export const FACE_SHAPES = ["round", "oval", "heart", "square", "long"] as const;

const ids = <T extends readonly { id: string }[]>(list: T) => list.map((item) => item.id) as unknown as [T[number]["id"], ...T[number]["id"][]];

export const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/**
 * The hero's look. Every field is optional: a parent may pick only the hair. Unknown keys are dropped
 * (z.object strips them), so a model's extra fields never get through.
 */
export const ChildLookSchema = z.object({
  skin: z.enum(ids(SKIN_TONES)).optional(),
  /** The exact colour Muse Spark saw (photo path); `skin` is its nearest swatch. */
  skinHex: HexColorSchema.optional(),
  hairColor: z.enum(ids(HAIR_COLORS)).optional(),
  hairLength: z.enum(HAIR_LENGTHS).optional(),
  hairTexture: z.enum(HAIR_TEXTURES).optional(),
  eyes: z.enum(ids(EYE_COLORS)).optional(),
  face: z.enum(FACE_SHAPES).optional(),
  glasses: z.boolean().optional(),
  freckles: z.boolean().optional(),
});
export type ChildLook = z.infer<typeof ChildLookSchema>;

/** The swatch nearest to a colour (plain RGB distance is enough for eight well-spread tones). */
export function nearestSwatch<T extends { id: string; hex: string }>(hex: string, swatches: readonly T[]): T {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r, g, b] = rgb(hex);
  let best = swatches[0];
  let bestDistance = Infinity;
  for (const swatch of swatches) {
    const [sr, sg, sb] = rgb(swatch.hex);
    const distance = (r - sr) ** 2 + (g - sg) ** 2 + (b - sb) ** 2;
    if (distance < bestDistance) {
      best = swatch;
      bestDistance = distance;
    }
  }
  return best;
}

const HAIR_LENGTH_WORDS: Record<(typeof HAIR_LENGTHS)[number], string> = {
  "very-short": "very short",
  short: "short",
  chin: "chin-length",
  shoulder: "shoulder-length",
  long: "long",
};
const FACE_WORDS: Record<(typeof FACE_SHAPES)[number], string> = {
  round: "a round face",
  oval: "an oval face",
  heart: "a heart-shaped face",
  square: "a square face",
  long: "a long face",
};
const words = (id: string) => id.replace(/-/g, " ");

/**
 * The look in plain English for the story writer and the illustrator, from the closed values only:
 * "light-medium skin (#D9A47F), shoulder-length curly red hair, green eyes, a round face, glasses,
 * freckles". Empty when nothing is set.
 */
export function lookSentence(look: ChildLook | undefined | null): string {
  if (!look) return "";
  const parts: string[] = [];
  if (look.skin || look.skinHex) {
    const hex = look.skinHex ?? SKIN_TONES.find((s) => s.id === look.skin)?.hex;
    const name = look.skin ?? (look.skinHex ? nearestSwatch(look.skinHex, SKIN_TONES).id : undefined);
    parts.push(`${words(name!)} skin tone${hex ? ` (${hex.toUpperCase()})` : ""}`);
  }
  const hair = [
    look.hairLength && HAIR_LENGTH_WORDS[look.hairLength],
    look.hairTexture,
    look.hairColor && words(look.hairColor),
  ].filter(Boolean);
  if (hair.length) parts.push(`${hair.join(" ")} hair`);
  if (look.eyes) parts.push(`${words(look.eyes)} eyes`);
  if (look.face) parts.push(FACE_WORDS[look.face]);
  if (look.glasses) parts.push("glasses");
  if (look.glasses === false) parts.push("no glasses");
  if (look.freckles) parts.push("freckles");
  return parts.join(", ");
}

/**
 * What Muse Spark returns about the child's photo (JSON); read strictly into ChildLook by
 * lookFromModel. Only appearance an illustrator draws; never ethnicity, origin, religion, health or
 * any other sensitive attribute (Meta's developer acceptable use policy forbids inferring them).
 */
export const ModelLookSchema = z.object({
  skin_tone_hex: HexColorSchema.optional().catch(undefined),
  hair_color: z.enum(ids(HAIR_COLORS)).optional().catch(undefined),
  hair_length: z.enum(HAIR_LENGTHS).optional().catch(undefined),
  hair_texture: z.enum(HAIR_TEXTURES).optional().catch(undefined),
  eye_color: z.enum(ids(EYE_COLORS)).optional().catch(undefined),
  face_shape: z.enum(FACE_SHAPES).optional().catch(undefined),
  glasses: z.boolean().optional().catch(undefined),
  freckles: z.boolean().optional().catch(undefined),
  /** The model's own "no person / cannot describe" answer. */
  refused: z.boolean().optional().catch(undefined),
});

/** The model's JSON as a ChildLook (null when it is not an object or describes nothing). */
export function lookFromModel(raw: unknown): ChildLook | null {
  const parsed = ModelLookSchema.safeParse(raw);
  if (!parsed.success || parsed.data.refused) return null;
  const m = parsed.data;
  const look: ChildLook = ChildLookSchema.parse({
    skin: m.skin_tone_hex ? nearestSwatch(m.skin_tone_hex, SKIN_TONES).id : undefined,
    skinHex: m.skin_tone_hex?.toUpperCase(),
    hairColor: m.hair_color,
    hairLength: m.hair_length,
    hairTexture: m.hair_texture,
    eyes: m.eye_color,
    face: m.face_shape,
    glasses: m.glasses,
    freckles: m.freckles,
  });
  const described = Object.values(look).some((v) => v !== undefined);
  return described ? look : null;
}

// ---- The photo path: consent, upload, and what the book keeps about the photo ---------------------

/** Body codes of the 4xx answers of POST /hero-photos. */
export const HERO_PHOTO_SIGN_IN = "hero_photo_sign_in";
export const HERO_PHOTO_OFF = "hero_photo_off";
export const CONSENT_OUTDATED = "consent_outdated";

/** Whether the photo path is offered in a country (its switch; on unless turned off). */
export function heroPhotoOffered(info: { heroPhoto?: boolean }): boolean {
  return info.heroPhoto !== false;
}

/** One line of the consent screen: a required checkbox or an information line, with an optional link. */
export const ConsentClauseSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
  kind: z.enum(["checkbox", "info"]),
  text: z.string().trim().min(1).max(600),
  link: z
    .object({
      url: z.string().trim().url().max(300).regex(/^https:\/\//, "An https link"),
      label: z.string().trim().min(1).max(80),
    })
    .optional(),
});
export type ConsentClause = z.infer<typeof ConsentClauseSchema>;

/** A language's clauses in order: the first is the lead line; at least one checkbox to tick. */
export const ConsentClausesSchema = z
  .array(ConsentClauseSchema)
  .min(1)
  .max(12)
  .superRefine((clauses, ctx) => {
    if (!clauses.some((c) => c.kind === "checkbox")) ctx.addIssue({ code: "custom", message: "At least one required checkbox" });
    const seen = new Set<string>();
    clauses.forEach((clause, i) => {
      if (seen.has(clause.id)) ctx.addIssue({ code: "custom", path: [i, "id"], message: "Duplicate clause" });
      seen.add(clause.id);
    });
  });

/** A published version of the consent in one language (GET /consent/hero-photo). */
export const ConsentTextSchema = z.object({
  language: LanguageSchema,
  version: z.number().int().min(1),
  clauses: z.array(ConsentClauseSchema),
  createdAt: z.string(),
});
export type ConsentText = z.infer<typeof ConsentTextSchema>;

/** A version as the admin lists it: who saved it too. */
export const AdminConsentVersionSchema = ConsentTextSchema.extend({ createdBy: z.string().nullable() });
export type AdminConsentVersion = z.infer<typeof AdminConsentVersionSchema>;

/** GET /admin/consent: every language's current version and its history, newest first. */
export const AdminConsentSchema = z.object({
  languages: z.array(z.object({ language: LanguageSchema, current: AdminConsentVersionSchema, history: z.array(AdminConsentVersionSchema) })),
});
export type AdminConsent = z.infer<typeof AdminConsentSchema>;

/** Body of PUT /admin/consent/:language: the clauses of the new version. */
export const UpdateConsentSchema = z.object({ clauses: ConsentClausesSchema });
export type UpdateConsent = z.infer<typeof UpdateConsentSchema>;

/** What the parent accepted: the version and language of the text shown, every checkbox ticked. */
export const ConsentAcceptSchema = z.object({
  version: z.number().int().min(1),
  language: LanguageSchema,
  accepted: z.literal(true),
});
export type ConsentAccept = z.infer<typeof ConsentAcceptSchema>;

/** Body of POST /hero-photos (signed in): the photo as a data URL and the consent given for it. */
export const HeroPhotoUploadSchema = z.object({
  image: z
    .string()
    .regex(/^data:[\w.+/-]*;base64,[A-Za-z0-9+/=]+$/, "A base64 data URL")
    .max(Math.ceil((7 * 1024 * 1024 * 4) / 3) + 100),
  consent: ConsentAcceptSchema,
});
export type HeroPhotoUpload = z.infer<typeof HeroPhotoUploadSchema>;
export const HeroPhotoUploadResultSchema = z.object({ upload: z.string() });

/** The id POST /hero-photos returns and the book refers to. */
export const HeroPhotoIdSchema = z.string().regex(/^[a-f0-9]{32}$/);

/** Why the photo was not used and the hero was drawn from the description instead. */
export const PHOTO_FALLBACKS = ["missing", "describe_refused", "describe_failed", "draw_refused", "draw_failed"] as const;
export type PhotoFallback = (typeof PHOTO_FALLBACKS)[number];

/**
 * What a book keeps about the parent's photo (Book.heroPhoto): the consent (version, language, when),
 * when the photo was described and drawn from, when it was deleted, and why it was not used if it
 * was not. Never the photo itself.
 */
export const HeroPhotoRecordSchema = z.object({
  consent: z.object({ version: z.number().int(), language: LanguageSchema, acceptedAt: z.string() }),
  uploadedAt: z.string(),
  /** The upload id it had (random, never the photo): to check it is gone. */
  upload: z.string().optional(),
  describedAt: z.string().nullable().default(null),
  drawnAt: z.string().nullable().default(null),
  deletedAt: z.string().nullable().default(null),
  fallback: z.enum(PHOTO_FALLBACKS).nullable().default(null),
});
export type HeroPhotoRecord = z.infer<typeof HeroPhotoRecordSchema>;

// ---- The default consent text -------------------------------------------------------------------------

export const META_AUP_URL = "https://dev.meta.ai/legal/acceptable-use-policy";

const clauses = (lead: string, meta: string, link: string, agree: string): ConsentClause[] => [
  { id: "purpose", kind: "info", text: lead },
  { id: "meta-terms", kind: "info", text: meta, link: { url: META_AUP_URL, label: link } },
  { id: "guardian", kind: "checkbox", text: agree },
];

/** Version 1 in every language; the admin's edits make the next versions. */
export const DEFAULT_CONSENT: Record<Language, ConsentClause[]> = {
  en: clauses(
    "The photo is sent to Meta (Muse Spark and Muse Image) for one purpose: to describe your child's appearance and draw the hero. Fabulka deletes it right after the hero is created and does not store it.",
    "Meta processes the photo under its own terms and may keep requests for a limited time for safety checks.",
    "Meta's acceptable use policy",
    "I am the parent or legal guardian of this child and I agree to this transfer.",
  ),
  ru: clauses(
    "Фото отправляется в Meta (Muse Spark и Muse Image) с одной целью: описать внешность ребёнка и нарисовать героя. Fabulka удаляет его сразу после того, как герой готов, и не хранит.",
    "Meta обрабатывает фото по своим правилам и может ограниченное время хранить запросы для проверок безопасности.",
    "Правила использования Meta",
    "Я родитель или законный представитель этого ребёнка и согласен(на) на эту передачу.",
  ),
  kk: clauses(
    "Фото Meta-ға (Muse Spark және Muse Image) бір ғана мақсатпен жіберіледі: баланың сыртқы келбетін сипаттап, кейіпкерді салу. Кейіпкер дайын болған соң Fabulka фотоны бірден өшіреді және сақтамайды.",
    "Meta фотоны өз ережелері бойынша өңдейді және қауіпсіздікті тексеру үшін сұраныстарды шектеулі уақыт сақтауы мүмкін.",
    "Meta-ның пайдалану ережелері",
    "Мен осы баланың ата-анасымын немесе заңды өкілімін және осы жіберуге келісемін.",
  ),
  es: clauses(
    "La foto se envía a Meta (Muse Spark y Muse Image) con un solo fin: describir el aspecto de tu hijo o hija y dibujar al protagonista. Fabulka la borra en cuanto el protagonista está listo y no la guarda.",
    "Meta trata la foto según sus propias condiciones y puede conservar las solicitudes durante un tiempo limitado para controles de seguridad.",
    "Política de uso aceptable de Meta",
    "Soy el padre, la madre o el tutor legal de este niño o niña y acepto este envío.",
  ),
  de: clauses(
    "Das Foto wird zu einem einzigen Zweck an Meta (Muse Spark und Muse Image) gesendet: um das Aussehen deines Kindes zu beschreiben und die Hauptfigur zu zeichnen. Fabulka löscht es, sobald die Hauptfigur fertig ist, und speichert es nicht.",
    "Meta verarbeitet das Foto nach seinen eigenen Bedingungen und kann Anfragen für Sicherheitsprüfungen eine begrenzte Zeit aufbewahren.",
    "Nutzungsrichtlinie von Meta",
    "Ich bin Elternteil oder gesetzlicher Vormund dieses Kindes und stimme dieser Übermittlung zu.",
  ),
};

/** The languages the consent is kept in (every site language). */
export const CONSENT_LANGUAGES = LANGUAGES;
