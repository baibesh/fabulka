import { z } from "zod";
import { BASE_LANGUAGES, LanguageSchema, localized, type Language } from "./language";

// ---- Story methods -----------------------------------------------------------------
// Methods live in the database and are edited in the admin; DEFAULT_METHODOLOGIES below only
// seeds it. Names and summaries are per interface language (shown to parents and in the admin);
// structure, rules and avoid are English because they go straight into the Muse Spark prompt.

/** What catalog books and books refer to a method by, so it never changes once created. */
export const MethodologySlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Только латинские буквы в нижнем регистре, цифры и дефисы")
  // The admin's page for a new method is /admin/methodologies/new.
  .refine((slug) => slug !== "new", "Этот адрес занят");
export type MethodologySlug = z.infer<typeof MethodologySlugSchema>;

/** Ages a method can be set for. */
export const METHODOLOGY_AGE_MIN = 2;
export const METHODOLOGY_AGE_MAX = 12;

const MethodologyTextSchema = z.object({
  name: z.string().trim().max(80),
  summary: z.string().trim().max(300),
});
export type MethodologyText = z.infer<typeof MethodologyTextSchema>;

/**
 * A method's name and summary by language (LANGUAGES): the base languages (BASE_LANGUAGES) are
 * required to publish, the rest are optional and fall back to them (see methodologyText).
 */
export const MethodologyTextsSchema = z.partialRecord(LanguageSchema, MethodologyTextSchema);
export type MethodologyTexts = z.infer<typeof MethodologyTextsSchema>;

/** The method's name and summary in `language`, each falling back like any localized text. */
export function methodologyText(texts: MethodologyTexts, language: Language): MethodologyText {
  const field = (key: keyof MethodologyText) =>
    localized(Object.fromEntries(Object.entries(texts).map(([lang, text]) => [lang, text?.[key] ?? ""])), language);
  return { name: field("name"), summary: field("summary") };
}

/** A story method as the site shows it, in the requested language (GET /methodologies). */
export const MethodologySchema = z.object({
  slug: z.string(),
  name: z.string(),
  summary: z.string(),
  /** Where the method comes from, so an author can read further. */
  source: z.string(),
  ageMin: z.number().int(),
  ageMax: z.number().int(),
});
export type Methodology = z.infer<typeof MethodologySchema>;

/** A method as stored: what the seed holds and what the prompt is built from. */
export interface MethodologyData {
  slug: string;
  texts: MethodologyTexts;
  source: string;
  ageMin: number;
  ageMax: number;
  /** Story beats in order; the pages are spread across them. */
  structure: string[];
  rules: string[];
  avoid: string[];
}

/** One item per line in the editor; each goes into the prompt as a list item. */
const promptLines = (maxLength: number) => z.array(z.string().trim().min(1).max(maxLength)).max(12);
const methodologyAge = z.number().int().min(METHODOLOGY_AGE_MIN).max(METHODOLOGY_AGE_MAX);

const MethodologyFieldsSchema = z.object({
  texts: MethodologyTextsSchema,
  source: z.string().trim().min(1, "Укажите источник методики").max(300),
  ageMin: methodologyAge,
  ageMax: methodologyAge,
  structure: promptLines(400).min(1, "Нужен хотя бы один шаг сюжета"),
  rules: promptLines(400),
  avoid: promptLines(200),
  published: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
});
type MethodologyFields = z.infer<typeof MethodologyFieldsSchema>;

/**
 * Russian is always required: it is the admin's language and the first fallback. A published method
 * is offered in every interface language, so it needs its name and summary in the base languages
 * (Russian and English), which every other language falls back to; a draft may wait for them.
 */
function checkMethodology(m: MethodologyFields, ctx: z.RefinementCtx) {
  if (m.ageMin > m.ageMax) {
    ctx.addIssue({ code: "custom", path: ["ageMax"], message: "Возраст «до» меньше возраста «от»" });
  }
  if (!m.texts.ru?.name) ctx.addIssue({ code: "custom", path: ["texts", "ru", "name"], message: "Назовите методику по-русски" });
  if (!m.texts.ru?.summary) {
    ctx.addIssue({ code: "custom", path: ["texts", "ru", "summary"], message: "Опишите методику по-русски" });
  }
  const missing = BASE_LANGUAGES.filter((lang) => !m.texts[lang]?.name || !m.texts[lang]?.summary);
  if (m.published && missing.length) {
    ctx.addIssue({
      code: "custom",
      path: ["published"],
      message: `Чтобы опубликовать, заполните название и описание на языках ${BASE_LANGUAGES.join(", ")}: не хватает ${missing.join(", ")}`,
    });
  }
}

/** Body of PUT /admin/methodologies/:slug: the whole method; the slug stays. */
export const UpdateMethodologySchema = MethodologyFieldsSchema.superRefine(checkMethodology);
export type UpdateMethodology = z.infer<typeof UpdateMethodologySchema>;

/** Body of POST /admin/methodologies. */
export const CreateMethodologySchema = MethodologyFieldsSchema.extend({ slug: MethodologySlugSchema }).superRefine(
  checkMethodology,
);
export type CreateMethodology = z.infer<typeof CreateMethodologySchema>;

/** Body of POST /admin/methodologies/preview: the method as it stands in the editor, saved or not. */
export const MethodologyPreviewSchema = MethodologyFieldsSchema.pick({
  ageMin: true,
  ageMax: true,
  structure: true,
  rules: true,
  avoid: true,
}).extend({
  slug: z.string().trim().max(40),
  source: z.string().trim().max(300),
});
export type MethodologyPreview = z.infer<typeof MethodologyPreviewSchema>;

/** The story prompt for a sample child of `age`, exactly as Muse Spark would get it. */
export const MethodologyPreviewResultSchema = z.object({ age: z.number().int(), prompt: z.string() });
export type MethodologyPreviewResult = z.infer<typeof MethodologyPreviewResultSchema>;

/** A method in the admin: every field, and what follows it. */
export const AdminMethodologySchema = z.object({
  slug: z.string(),
  texts: MethodologyTextsSchema,
  source: z.string(),
  ageMin: z.number().int(),
  ageMax: z.number().int(),
  structure: z.array(z.string()),
  rules: z.array(z.string()),
  avoid: z.array(z.string()),
  published: z.boolean(),
  sortOrder: z.number().int(),
  /** Catalog books and books that follow the method; while there are any it cannot be deleted. */
  templates: z.number().int(),
  books: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminMethodology = z.infer<typeof AdminMethodologySchema>;

/** Body of a 409 from DELETE /admin/methodologies/:slug: catalog books or books follow the method. */
export const METHODOLOGY_IN_USE = "methodology_in_use";
/** Body of a 409 from POST /admin/methodologies: a method with that slug exists. */
export const METHODOLOGY_EXISTS = "methodology_exists";
/** Body of a 400 from POST /books: there is no published method with that slug. */
export const METHODOLOGY_UNKNOWN = "methodology_unknown";
/** Body of a 400 from POST /books: the method is not for the child's age, or none is. */
export const METHODOLOGY_AGE = "methodology_age";

export function fitsAge(method: { ageMin: number; ageMax: number }, age: number): boolean {
  return age >= method.ageMin && age <= method.ageMax;
}

/**
 * Used when the parent does not pick a method: from `methods` (the published ones, in their order),
 * rhythm and repetition for toddlers and an adventure for older children when they are there and
 * fit, else the first one that fits. Undefined when none fits the age.
 */
export function defaultMethodology<T extends { slug: string; ageMin: number; ageMax: number }>(
  methods: readonly T[],
  age: number,
): T | undefined {
  const preferred = age <= 3 ? "toddler-routine" : "adventure-quest";
  const fitting = methods.filter((m) => fitsAge(m, age));
  return fitting.find((m) => m.slug === preferred) ?? fitting[0];
}

/**
 * The methods the service starts with. The API adds the ones missing from the database on start and
 * never overwrites what the admin has changed; nothing reads this list at runtime.
 */
export const DEFAULT_METHODOLOGIES: readonly MethodologyData[] = [

  {
    slug: "toddler-routine",
    texts: {
      ru: {
        name: "Повтор и ритм для малышей",
        summary: "Знакомый день малыша с повторяющейся фразой, звуками и маленьким добрым сюрпризом.",
      },
      kk: {
        name: "Кішкентайларға арналған қайталау мен ырғақ",
        summary: "Қайталанатын сөз тіркесі, дыбыстар және кішкентай мейірімді тосынсыйы бар таныс күн.",
      },
      en: {
        name: "Rhythm and repetition for toddlers",
        summary: "A familiar day with a repeating line, sounds to say along and a small, kind surprise.",
      },
      es: {
        name: "Ritmo y repetición para los más pequeños",
        summary: "Un día conocido con una frase que se repite, sonidos para decir en voz alta y una pequeña sorpresa bonita.",
      },
      de: {
        name: "Rhythmus und Wiederholung für die Kleinsten",
        summary: "Ein vertrauter Tag mit einem Satz, der immer wiederkehrt, Geräuschen zum Mitsprechen und einer kleinen, liebevollen Überraschung.",
      },
    },
    source: "Predictable and repetitive texts in early literacy; reality-based stories for toddlers",
    ageMin: 2,
    ageMax: 4,
    structure: [
      "A familiar everyday moment (morning, walk, bath, meal or bedtime) in a real place.",
      "A repeated pattern: on each page the hero meets or does something, and a short refrain line repeats with one small change.",
      "A small, gentle surprise that is never scary.",
      "A calm ending back in a cozy, safe place; the refrain closes the book.",
    ],
    rules: [
      "Keep the world real: no magic, no talking objects.",
      "Repeat the same refrain line on most pages so the child can say it along.",
      "Use sound words the child can imitate and name concrete things, colors and animals.",
      "One simple action per page.",
    ],
    avoid: ["villains or danger", "loss or sadness", "abstract words", "irony"],
  },
  {
    slug: "social-story",
    texts: {
      ru: {
        name: "Социальная история",
        summary: "Спокойно готовит к новому: детский сад, врач, перелёт, переезд, братик или сестрёнка.",
      },
      kk: {
        name: "Әлеуметтік әңгіме",
        summary: "Жаңа жағдайға сабырмен дайындайды: балабақша, дәрігер, ұшақ, көшу, інісі не сіңлісі.",
      },
      en: {
        name: "Social story",
        summary: "Calmly prepares for something new: kindergarten, the doctor, a flight, a move, a new sibling.",
      },
      es: {
        name: "Historia social",
        summary: "Prepara con calma para algo nuevo: la guardería, el médico, un vuelo, una mudanza, un hermanito.",
      },
      de: {
        name: "Soziale Geschichte",
        summary: "Bereitet in Ruhe auf Neues vor: Kita, Arztbesuch, Flug, Umzug oder ein Geschwisterchen.",
      },
    },
    source: "Social Stories by Carol Gray",
    ageMin: 2,
    ageMax: 8,
    structure: [
      "Where and when: the setting and who is there, described calmly and truthfully.",
      "What happens, step by step, in the order the child will live it.",
      "What other people do, think and feel, and why.",
      "What the hero can try: gentle options with \"can\" or \"may try\", never orders.",
      "A reassuring ending that notices what the hero did well.",
    ],
    rules: [
      "Most sentences describe; only a few suggest what the hero can do.",
      "Literal language: no idioms, irony or exaggeration.",
      "It is fine to feel a little worried; say so honestly and show that it passes.",
      "Keep the setting real so the child recognises it later.",
    ],
    avoid: ["\"must\" and \"never\"", "threats or punishment", "surprises", "magic that hides the real situation"],
  },
  {
    slug: "sel-emotions",
    texts: {
      ru: {
        name: "Эмоциональный интеллект",
        summary: "Герой учится замечать и называть чувства, успокаиваться и понимать других.",
      },
      kk: {
        name: "Эмоциялық интеллект",
        summary: "Кейіпкер сезімдерін байқап, атауды, сабырға келуді және басқаларды түсінуді үйренеді.",
      },
      en: {
        name: "Emotional intelligence",
        summary: "The hero learns to notice and name feelings, calm down and understand others.",
      },
      es: {
        name: "Inteligencia emocional",
        summary: "El protagonista aprende a notar y nombrar lo que siente, a calmarse y a entender a los demás.",
      },
      de: {
        name: "Emotionale Intelligenz",
        summary: "Die Hauptfigur lernt, Gefühle zu bemerken und zu benennen, sich zu beruhigen und andere zu verstehen.",
      },
    },
    source: "CASEL social and emotional learning framework; emotion coaching by John Gottman",
    ageMin: 4,
    ageMax: 10,
    structure: [
      "An ordinary day; something happens that gives the hero a strong feeling (anger, fear, sadness, jealousy or disappointment).",
      "The hero names the feeling and notices it in the body.",
      "A grown-up or friend listens and accepts the feeling without shaming.",
      "The hero tries a way to calm down (slow breaths, counting, a hug, a quiet corner) and thinks about how others feel.",
      "The hero chooses what to do and solves the problem or makes up with someone.",
      "The hero knows what to try next time.",
    ],
    rules: [
      "Name emotions with plain words.",
      "Every feeling is allowed; what we do with it is a choice.",
      "Grown-ups stay calm and kind.",
      "Show the other character's feelings too.",
    ],
    avoid: ["\"big kids don't cry\"", "shaming", "punishment as the lesson", "a narrator who lectures"],
  },
  {
    slug: "growth-mindset",
    texts: {
      ru: {
        name: "Мышление роста",
        summary: "Не получилось — пока. Герой пробует, ошибается, ищет способ и добивается своего трудом.",
      },
      kk: {
        name: "Даму ойлауы",
        summary: "Шықпады — әзірге. Кейіпкер байқап, қателесіп, жол іздейді және еңбекпен мақсатына жетеді.",
      },
      en: {
        name: "Growth mindset",
        summary: "Can't do it — yet. The hero tries, makes mistakes, finds a way and gets there through effort.",
      },
      es: {
        name: "Mentalidad de crecimiento",
        summary: "No me sale… todavía. El protagonista lo intenta, se equivoca, busca la manera y lo consigue con esfuerzo.",
      },
      de: {
        name: "Wachstumsdenken",
        summary: "„Ich kann das nicht“ – noch nicht! Die Hauptfigur probiert, macht Fehler, findet einen Weg und schafft es mit Ausdauer.",
      },
    },
    source: "Growth mindset research by Carol Dweck",
    ageMin: 5,
    ageMax: 10,
    structure: [
      "The hero wants to do something hard that is linked to the child's interests.",
      "The first try fails; the hero is frustrated and says \"I can't\".",
      "Someone helps turn it into \"I can't do it yet\"; mistakes help us learn.",
      "The hero practises, tries new ways and asks for help.",
      "Step-by-step progress, then success that comes from effort and a good strategy.",
      "The hero shares what they learned or helps someone else.",
    ],
    rules: [
      "Praise effort, strategy and not giving up, never talent or being smart.",
      "Show mistakes as a normal part of learning.",
      "Use the word \"yet\" at the turning point.",
    ],
    avoid: ["instant magic success", "a born gift", "comparing the hero with other children"],
  },
  {
    slug: "mirrors-windows",
    texts: {
      ru: {
        name: "Зеркала и окна",
        summary: "Ребёнок узнаёт в книге свой город и культуру и открывает для себя мир других людей.",
      },
      kk: {
        name: "Айналар мен терезелер",
        summary: "Бала кітаптан өз қаласы мен мәдениетін таниды және басқа адамдардың әлемін ашады.",
      },
      en: {
        name: "Mirrors and windows",
        summary: "Children see their own city and culture in the book and discover the worlds of other people.",
      },
      es: {
        name: "Espejos y ventanas",
        summary: "Los niños reconocen en el libro su ciudad y su cultura, y descubren el mundo de otras personas.",
      },
      de: {
        name: "Spiegel und Fenster",
        summary: "Dein Kind entdeckt im Buch seine eigene Stadt und Kultur – und die Welt anderer Menschen.",
      },
    },
    source: "\"Mirrors, windows and sliding glass doors\" by Rudine Sims Bishop",
    ageMin: 4,
    ageMax: 10,
    structure: [
      "Mirror: the hero's own world with real details of their city and Kazakh culture (places, food, traditions, words).",
      "The hero meets someone or something from another place, culture or way of life.",
      "Curiosity: questions and respectful noticing of what is different and what is the same.",
      "Something they do together where both bring something of their own.",
      "Both learn from each other; a warm ending that celebrates both worlds.",
    ],
    rules: [
      "Cultural details are accurate and respectful.",
      "Use real places in the hero's city.",
      "The other character has their own wishes and ideas, not just a role in the hero's story.",
    ],
    avoid: ["stereotypes", "one culture shown as better", "exotic clichés"],
  },
  {
    slug: "adventure-quest",
    texts: {
      ru: {
        name: "Приключение",
        summary: "Путешествие в волшебный мир по интересам ребёнка, где побеждают доброта и смекалка.",
      },
      kk: {
        name: "Шытырман оқиға",
        summary: "Мейірімділік пен тапқырлық жеңетін, баланың қызығушылықтарына сай сиқырлы әлемге саяхат.",
      },
      en: {
        name: "Adventure",
        summary: "A journey to a magical place built on the child's interests, where kindness and wit win.",
      },
      es: {
        name: "Aventura",
        summary: "Un viaje a un mundo mágico inspirado en lo que más le gusta al niño, donde ganan la bondad y el ingenio.",
      },
      de: {
        name: "Abenteuer",
        summary: "Eine Reise in eine magische Welt rund um die Lieblingsthemen deines Kindes, in der Freundlichkeit und Köpfchen gewinnen.",
      },
    },
    source: "The hero's journey (Campbell, Vogler), adapted for picture books",
    ageMin: 4,
    ageMax: 10,
    structure: [
      "The hero's ordinary world in their home city.",
      "A call to adventure linked to the child's interests.",
      "A friendly helper appears.",
      "The hero enters a magical or faraway place.",
      "Two small challenges the hero solves using their interests and skills.",
      "The biggest challenge, solved with kindness, cleverness or teamwork, never by fighting.",
      "The hero returns home a little braver, with a gift or a new friend.",
    ],
    rules: [
      "The hero makes the key decisions; grown-ups do not rescue them.",
      "Tension stays mild and is resolved within a page or two.",
    ],
    avoid: ["violence or weapons", "villains who are evil for no reason", "frightening images"],
  },
];

/** Text norms per age, applied on top of any method. */
export interface AgeBand {
  ageMin: number;
  ageMax: number;
  sentencesPerPage: string;
  maxWordsPerPage: number;
  guidance: string[];
}

export const AGE_BANDS: readonly AgeBand[] = [
  {
    ageMin: 2,
    ageMax: 4,
    sentencesPerPage: "1 to 2 short sentences",
    maxWordsPerPage: 25,
    guidance: ["Words a toddler knows.", "Present tense, short sentences.", "No danger at all."],
  },
  {
    ageMin: 5,
    ageMax: 7,
    sentencesPerPage: "2 to 4 sentences",
    maxWordsPerPage: 60,
    guidance: ["One clear problem.", "Simple dialogue is welcome.", "Mild tension, resolved quickly."],
  },
  {
    ageMin: 8,
    ageMax: 10,
    sentencesPerPage: "3 to 6 sentences",
    maxWordsPerPage: 100,
    guidance: ["Richer vocabulary and dialogue.", "A small twist is welcome.", "Light suspense is fine."],
  },
];

export function ageBand(age: number): AgeBand {
  return AGE_BANDS.find((b) => age >= b.ageMin && age <= b.ageMax) ?? AGE_BANDS[AGE_BANDS.length - 1];
}

/**
 * Every book ends with questions for the parent to ask while reading together (dialogic reading,
 * Whitehurst: the CROWD prompts). Younger children get easier kinds.
 */
export function talkQuestionKinds(age: number): string[] {
  return age <= 4
    ? ["finish a sentence from the book", "recall what happened", "a what/where/who question about a picture"]
    : [
        "recall what happened",
        "an open question about a picture",
        "why a character felt or acted that way",
        "connect the story to the child's own life",
      ];
}

