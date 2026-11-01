import { z } from "zod";
import { LANGUAGES, LanguageSchema, localizedTextSchema, type Language } from "./language";

// ---- Reference data the owner edits in the admin («Справочники») ----------------------------
//
// Kept in the Setting table (keys below) and seeded from the defaults here when absent. The API
// prices every purchase and order from the stored values; the site reads them from GET /reference.

/** Setting keys of the reference data. */
export const REFERENCE_KEYS = {
  prices: "reference.prices",
  cities: "reference.cities",
  extraBlocked: "geo.extra_blocked",
  countries: "reference.countries",
  faq: "reference.faq",
} as const;

const tenge = z.number().int().min(0).max(10_000_000);
/** Dollars with at most two decimals: 3.9, 5.90. */
const dollars = z
  .number()
  .min(0)
  .max(100_000)
  .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, "At most two decimals");

/** What one more generated book costs in each currency (tenge in Kazakhstan, dollars elsewhere). */
export const BookPriceSchema = z.object({ KZT: tenge.min(1), USD: dollars.min(0.01) });

export const PricesSchema = z.object({
  /** One more generated (digital) book once the free ones are used, by kind. */
  books: z.object({ template: BookPriceSchema, custom: BookPriceSchema }),
  /** One printed copy, by cover, in tenge. */
  covers: z.object({ soft: tenge.min(1), hard: tenge.min(1) }),
  /** Flat delivery fee to a city without free delivery, in tenge. */
  deliveryKzt: tenge,
});
export type Prices = z.infer<typeof PricesSchema>;

const cityName = z.string().trim().min(2).max(60);

/** A city we deliver printed books to. The Russian name is what an order stores. */
export const CitySchema = z.object({
  ru: cityName,
  kk: cityName,
  en: cityName,
  /** Our print partners deliver here for free; elsewhere the flat fee applies. */
  freeDelivery: z.boolean(),
});
export type City = z.infer<typeof CitySchema>;

/** Body of PUT /admin/reference/cities: the whole list in the order the order form shows it. */
export const CitiesSchema = z
  .array(CitySchema)
  .min(1)
  .max(100)
  .superRefine((cities, ctx) => {
    const seen = new Set<string>();
    cities.forEach((city, i) => {
      const key = city.ru.trim().toLowerCase();
      if (seen.has(key)) ctx.addIssue({ code: "custom", path: [i, "ru"], message: "Duplicate city" });
      seen.add(key);
    });
  });

/** ISO 3166-1 alpha-2 codes, plus XK (Kosovo), which country databases use. */
export const ISO_COUNTRY_CODES: readonly string[] = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT " +
  "MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG " +
  "UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW"
).split(" ");

/** A country code the owner types: trimmed, upper-cased, and a real ISO 3166 alpha-2 code. */
export const CountryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine((code) => ISO_COUNTRY_CODES.includes(code), "Unknown country code");

// ---- Countries ---------------------------------------------------------------------------------

export const CURRENCIES = ["KZT", "USD"] as const;
export const CurrencySchema = z.enum(CURRENCIES);
export type Currency = z.infer<typeof CurrencySchema>;

/**
 * Everywhere not in the owner's list (reference.countries). Always offered, never edited: English
 * and Russian, prices in dollars, no print.
 */
export const OTHER_COUNTRY = "other";

/** A country the site offers (an ISO code from reference.countries) or "other". */
export type Country = string;

export interface CountryInfo {
  /** Interface and book languages offered there; the first is the default. */
  languages: readonly Language[];
  currency: Currency;
  /** A print partner delivers there. */
  print: boolean;
}

export const OTHER_COUNTRY_INFO: CountryInfo = { languages: ["en", "ru"], currency: "USD", print: false };

/** A country in the owner's list: what the site speaks, charges and prints there. */
export const CountryEntrySchema = z.object({
  code: CountryCodeSchema,
  /** The first is the default. */
  languages: z
    .array(LanguageSchema)
    .min(1)
    .max(LANGUAGES.length)
    .refine((list) => new Set(list).size === list.length, "Duplicate language"),
  currency: CurrencySchema,
  print: z.boolean(),
});
export type CountryEntry = z.infer<typeof CountryEntrySchema>;

/** Body of PUT /admin/reference/countries: the whole list in the order the site shows it. */
export const CountriesSchema = z
  .array(CountryEntrySchema)
  .min(1)
  .max(ISO_COUNTRY_CODES.length)
  .superRefine((countries, ctx) => {
    const seen = new Set<string>();
    countries.forEach((country, i) => {
      if (seen.has(country.code)) ctx.addIssue({ code: "custom", path: [i, "code"], message: "Duplicate country" });
      seen.add(country.code);
    });
  });

/** What the site offers in `country`: its entry in the list, else what "other" gets. */
export function countryInfo(country: Country, countries: readonly CountryEntry[]): CountryInfo {
  return countries.find((c) => c.code === country) ?? OTHER_COUNTRY_INFO;
}

/**
 * Our country for an ISO code (the visitor's IP or a saved choice): a listed one, else "other". No
 * code at all (a local address, say) is taken for Kazakhstan, the home market, or the first listed
 * country when Kazakhstan is not offered.
 */
export function countryFromIp(iso: string | null, countries: readonly CountryEntry[]): Country {
  if (!iso) return countries.find((c) => c.code === "KZ")?.code ?? countries[0]?.code ?? OTHER_COUNTRY;
  const code = iso.trim().toUpperCase();
  return countries.some((c) => c.code === code) ? code : OTHER_COUNTRY;
}

/** `language` when the country offers it, else the country's default language. */
export function languageFor(country: Country, language: Language, countries: readonly CountryEntry[]): Language {
  const { languages } = countryInfo(country, countries);
  return languages.includes(language) ? language : languages[0];
}

/** Body of PUT /admin/reference/blocked: the countries the owner blocks on top of Meta's list. */
export const UpdateBlockedSchema = z.object({
  extra: z
    .array(CountryCodeSchema)
    .max(100)
    .superRefine((codes, ctx) => {
      codes.forEach((code, i) => {
        if (codes.indexOf(code) !== i) ctx.addIssue({ code: "custom", path: [i], message: "Duplicate country" });
      });
    }),
});
export type UpdateBlocked = z.infer<typeof UpdateBlockedSchema>;

/**
 * Body of a 400 from PUT /admin/reference/blocked: a code is on Meta's list already. That list
 * lives in the API's code and can never be changed from the admin.
 */
export const COUNTRY_POLICY_BLOCKED = "country_policy_blocked";

/**
 * Body of a 400 from PUT /admin/reference/countries: a code the owner blocked (geo.extra_blocked)
 * cannot be offered on the site. A code on Meta's list gets COUNTRY_POLICY_BLOCKED instead.
 */
export const COUNTRY_BLOCKED = "country_blocked";

// ---- FAQ -----------------------------------------------------------------------------------

/**
 * Placeholders an FAQ answer (or question) may hold, filled on the site for the visitor's country
 * and language: prices come from reference.prices, so an answer never goes stale.
 */
export const FAQ_PLACEHOLDERS = [
  "templatePrice",
  "customPrice",
  "softCover",
  "hardCover",
  "delivery",
  "freeCities",
  "languages",
  "country",
] as const;
export type FaqPlaceholder = (typeof FAQ_PLACEHOLDERS)[number];

/** A country an FAQ entry is for: an ISO code or "other" (everyone not in reference.countries). */
const FaqCountrySchema = z.union([z.literal(OTHER_COUNTRY), CountryCodeSchema]);

/** One question on the landing page, in three languages, for some or all countries. */
export const FaqItemSchema = z
  .object({
    /** Stable, for the page's test ids and the admin's list keys. */
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
    /** By language code; Russian and English required, the rest fall back to them (see `localized`). */
    q: localizedTextSchema(200),
    a: localizedTextSchema(1500),
    /** Empty: shown everywhere. Else only in these countries, or everywhere but them (`excludeCountries`). */
    countries: z
      .array(FaqCountrySchema)
      .max(ISO_COUNTRY_CODES.length + 1)
      .refine((list) => new Set(list).size === list.length, "Duplicate country"),
    excludeCountries: z.boolean().default(false),
    published: z.boolean(),
  })
  .refine((item) => !item.excludeCountries || item.countries.length > 0, {
    path: ["countries"],
    message: "Pick the countries to leave out",
  });
export type FaqItem = z.infer<typeof FaqItemSchema>;

/** Body of PUT /admin/reference/faq: the whole list in the order the landing shows it. */
export const FaqSchema = z
  .array(FaqItemSchema)
  .max(100)
  .superRefine((items, ctx) => {
    const seen = new Set<string>();
    items.forEach((item, i) => {
      if (seen.has(item.id)) ctx.addIssue({ code: "custom", path: [i, "id"], message: "Duplicate id" });
      seen.add(item.id);
    });
  });

/** The published entries a visitor from `country` (a listed code or "other") sees, in order. */
export function faqFor(items: readonly FaqItem[], country: Country): FaqItem[] {
  return items.filter(
    (item) => item.published && (item.countries.length === 0 || item.countries.includes(country) !== item.excludeCountries),
  );
}

/** Fills {placeholders} in an FAQ text; an unknown one stays as written. */
export function fillFaq(text: string, vars: Partial<Record<FaqPlaceholder, string>>): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => vars[name as FaqPlaceholder] ?? whole);
}

/**
 * GET /reference: what the site prices and offers. `countries` leaves out the blocked ones (Meta's
 * and the owner's), so the site never offers them; "other" is not in it.
 */
export const ReferenceSchema = z.object({
  prices: PricesSchema,
  cities: z.array(CitySchema),
  countries: z.array(CountryEntrySchema),
  /** The landing's questions; the site gets only the published ones and picks those for its country. */
  faq: z.array(FaqItemSchema),
});
export type Reference = z.infer<typeof ReferenceSchema>;

export const BlockedCountriesSchema = z.object({
  /** Meta's Restricted Territories (and India), from the API's code: read-only. */
  meta: z.array(z.object({ code: z.string(), name: z.string() })),
  /** Countries the owner added. */
  extra: z.array(z.string()),
  /** Meta's Model Designation and Geographic Use Policy. */
  policyUrl: z.string(),
});
export type BlockedCountries = z.infer<typeof BlockedCountriesSchema>;

/** GET /admin/reference. `countries` is the whole stored list, blocked ones included; `faq` has drafts too. */
export const AdminReferenceSchema = ReferenceSchema.extend({ blocked: BlockedCountriesSchema });
export type AdminReference = z.infer<typeof AdminReferenceSchema>;

/** The prices the site launched with; the seed of reference.prices. */
export const DEFAULT_PRICES: Prices = {
  books: {
    template: { KZT: 1900, USD: 3.9 },
    custom: { KZT: 2900, USD: 5.9 },
  },
  covers: { soft: 9900, hard: 14900 },
  deliveryKzt: 1500,
};

/** The cities the site launched with; the seed of reference.cities. */
export const DEFAULT_CITIES: City[] = [
  { ru: "Алматы", kk: "Алматы", en: "Almaty", freeDelivery: true },
  { ru: "Астана", kk: "Астана", en: "Astana", freeDelivery: true },
  { ru: "Шымкент", kk: "Шымкент", en: "Shymkent", freeDelivery: false },
  { ru: "Караганда", kk: "Қарағанды", en: "Karaganda", freeDelivery: false },
  { ru: "Актобе", kk: "Ақтөбе", en: "Aktobe", freeDelivery: false },
  { ru: "Тараз", kk: "Тараз", en: "Taraz", freeDelivery: false },
  { ru: "Павлодар", kk: "Павлодар", en: "Pavlodar", freeDelivery: false },
  { ru: "Усть-Каменогорск", kk: "Өскемен", en: "Oskemen", freeDelivery: false },
  { ru: "Атырау", kk: "Атырау", en: "Atyrau", freeDelivery: false },
  { ru: "Костанай", kk: "Қостанай", en: "Kostanay", freeDelivery: false },
];

const ruEn: Language[] = ["ru", "en"];
const enRu: Language[] = ["en", "ru"];
const abroad = (code: string, languages: Language[]): CountryEntry => ({ code, languages, currency: "USD", print: false });

/**
 * The countries the site launched with; the seed of reference.countries. Kazakhstan first (tenge,
 * print), then the neighbours and the places a Russian-, Kazakh- or English-speaking family lives.
 * Nothing on Meta's list of restricted territories.
 */
export const DEFAULT_COUNTRIES: CountryEntry[] = [
  { code: "KZ", languages: ["kk", "ru", "en"], currency: "KZT", print: true },
  abroad("UZ", ruEn),
  abroad("KG", ruEn),
  abroad("TJ", ruEn),
  abroad("TM", ruEn),
  abroad("AZ", ruEn),
  abroad("AM", ruEn),
  abroad("GE", ruEn),
  abroad("MD", ruEn),
  abroad("MN", ruEn),
  abroad("TR", enRu),
  abroad("AE", enRu),
  abroad("IL", ruEn),
  abroad("DE", enRu),
  abroad("PL", enRu),
  abroad("CZ", enRu),
  abroad("GB", enRu),
  abroad("US", enRu),
  abroad("CA", enRu),
];

const everywhere = { countries: [], excludeCountries: false, published: true };
const onlyKz = { countries: ["KZ"], excludeCountries: false, published: true };
const notKz = { countries: ["KZ"], excludeCountries: true, published: true };

/**
 * The landing's questions the site launched with; the seed of reference.faq. Where the facts
 * differ by country (languages, prices, print) there is one entry for Kazakhstan and one for
 * everyone else.
 */
export const DEFAULT_FAQ: FaqItem[] = [
  {
    id: "time",
    ...everywhere,
    q: { ru: "Сколько ждать книгу?", kk: "Кітапты қанша күту керек?", en: "How long does it take?" },
    a: {
      ru: "Обычно около трёх минут: сначала пишется сказка, потом рисуются герой и страницы. Прогресс видно на странице книги, а готовую можно сразу листать и скачать в PDF.",
      kk: "Әдетте үш минуттай: алдымен ертегі жазылады, содан кейін кейіпкер мен беттер салынады. Барысы кітап бетінде көрінеді, дайын кітапты бірден парақтап, PDF түрінде жүктеуге болады.",
      en: "Usually about three minutes: first the story is written, then the hero and the pages are drawn. You can watch the progress on the book's page, then read the finished book or download the PDF right away.",
    },
  },
  {
    id: "kazakh",
    ...onlyKz,
    q: { ru: "Можно ли сделать книгу на казахском?", kk: "Кітапты қазақ тілінде жасауға бола ма?", en: "Can I make a book in Kazakh?" },
    a: {
      ru: "Да. Язык книги выбирается в форме: қазақша, русский или English. Сказка пишется сразу на этом языке, а не переводится.",
      kk: "Иә. Кітап тілі формада таңдалады: қазақша, русский немесе English. Ертегі аударылмайды, бірден сол тілде жазылады.",
      en: "Yes. You choose the book's language in the form: қазақша, русский or English. The story is written in that language, not translated.",
    },
  },
  {
    id: "languages",
    ...notKz,
    q: { ru: "На каких языках можно сделать книгу?", kk: "Кітапты қай тілдерде жасауға болады?", en: "Which languages can a book be in?" },
    a: {
      ru: "Язык книги выбирается в форме: {languages}. Сказка пишется сразу на этом языке, а не переводится.",
      kk: "Кітап тілі формада таңдалады: {languages}. Ертегі аударылмайды, бірден сол тілде жазылады.",
      en: "You choose the book's language in the form: {languages}. The story is written in that language, not translated.",
    },
  },
  {
    id: "price-kz",
    ...onlyKz,
    q: { ru: "Сколько стоит книга?", kk: "Кітап қанша тұрады?", en: "How much does a book cost?" },
    a: {
      ru: "Первые книги — бесплатно. Дальше книга из каталога стоит {templatePrice}, своя история — {customPrice}. Цены в тенге; печатная книга оплачивается отдельно.",
      kk: "Алғашқы кітаптар — тегін. Одан кейін каталогтағы кітап — {templatePrice}, өз ертегің — {customPrice}. Бағалар теңгемен; басылған кітап бөлек төленеді.",
      en: "Your first books are free. After that a catalog book is {templatePrice} and a story of your own {customPrice}. Prices are in tenge; a printed copy is paid for separately.",
    },
  },
  {
    id: "price-abroad",
    ...notKz,
    q: { ru: "Сколько стоит книга?", kk: "Кітап қанша тұрады?", en: "How much does a book cost?" },
    a: {
      ru: "Первые книги — бесплатно. Дальше книга из каталога стоит {templatePrice}, своя история — {customPrice}. Для вашей страны цены указаны в долларах.",
      kk: "Алғашқы кітаптар — тегін. Одан кейін каталогтағы кітап — {templatePrice}, өз ертегің — {customPrice}. Сіздің еліңіз үшін бағалар долларда көрсетілген.",
      en: "Your first books are free. After that a catalog book is {templatePrice} and a story of your own {customPrice}. For your country prices are in US dollars.",
    },
  },
  {
    id: "data",
    ...everywhere,
    q: { ru: "Что происходит с данными ребёнка?", kk: "Баланың деректері не болады?", en: "What happens to my child's data?" },
    a: {
      ru: "Данные хранятся на серверах в Казахстане. Мы не просим фотографий детей: героя рисуют по описанию, а фото нужно только для игрушки, если захотите. Всё удалим по запросу на hello@fabulka.com.",
      kk: "Деректер Қазақстандағы серверлерде сақталады. Біз балалардың фотосын сұрамаймыз: кейіпкер сипаттама бойынша салынады, ал фото тек ойыншық үшін, қаласаңыз ғана керек. Сұрауыңыз бойынша бәрін өшіреміз: hello@fabulka.com.",
      en: "It is stored on servers in Kazakhstan. We never ask for photos of children: the hero is drawn from a description, and a photo is only needed for the toy, if you want one. We delete everything on request at hello@fabulka.com.",
    },
  },
  {
    id: "print-kz",
    ...onlyKz,
    q: { ru: "Как заказать печатную книгу?", kk: "Басылған кітапқа қалай тапсырыс беремін?", en: "How do I get a printed book?" },
    a: {
      ru: "На странице готовой книги нажмите «Заказать печатную книгу». Мягкая обложка — {softCover}, твёрдая — {hardCover}. Бесплатная доставка: {freeCities}; в другие города Казахстана — {delivery}.",
      kk: "Дайын кітаптың бетінде «Басылған кітапқа тапсырыс» батырмасын басыңыз. Жұмсақ мұқаба — {softCover}, қатты мұқаба — {hardCover}. Тегін жеткізу: {freeCities}; Қазақстанның басқа қалаларына — {delivery}.",
      en: "On the finished book's page, press “Order a printed book”. A soft cover is {softCover}, a hard cover {hardCover}. Free delivery to {freeCities}; to other cities in Kazakhstan, {delivery}.",
    },
  },
  {
    id: "print-abroad",
    ...notKz,
    q: { ru: "Можно ли заказать печатную книгу?", kk: "Басылған кітапқа тапсырыс беруге бола ма?", en: "Can I get a printed book?" },
    a: {
      ru: "К сожалению, в вашей стране печатные книги пока недоступны, но мы планируем открыть печать и в других странах. А пока готовую книгу можно скачать в PDF и распечатать самим. Нажмите «Хочу печатную книгу» на странице книги — и мы сообщим, когда печать заработает у вас.",
      kk: "Өкінішке қарай, сіздің еліңізде басылған кітаптар әзірге қолжетімсіз, бірақ біз басып шығаруды басқа елдерде де ашуды жоспарлап отырмыз. Әзірге дайын кітапты PDF түрінде жүктеп, өзіңіз басып шығара аласыз. Кітап бетінде «Басылған кітап керек» батырмасын басыңыз — басып шығару сіздің елде іске қосылғанда хабарлаймыз.",
      en: "Unfortunately, printed books aren't available in your country yet, but we plan to bring printing to more countries. Meanwhile you can download the finished book as a PDF and print it yourself. Press “I want a printed book” on the book's page and we'll let you know when printing reaches you.",
    },
  },
  {
    id: "account",
    ...everywhere,
    q: { ru: "Нужно ли регистрироваться?", kk: "Тіркелу керек пе?", en: "Do I need to sign up?" },
    a: {
      ru: "Нет. Книги сохраняются в вашем браузере, в разделе «Мои книги». Достаточно открыть каталог и выбрать историю.",
      kk: "Жоқ. Кітаптар браузеріңізде, «Менің кітаптарым» бөлімінде сақталады. Каталогты ашып, ертегі таңдасаңыз жеткілікті.",
      en: "No. Your books are kept in your browser under “My books”. Just open the catalog and choose a story.",
    },
  },
  {
    id: "dislike",
    ...everywhere,
    q: { ru: "А если книга не понравится?", kk: "Кітап ұнамаса ше?", en: "What if I don't like the book?" },
    a: {
      ru: "Сделайте новую: поменяйте ответы, тему или методику. Если что-то пошло не так, напишите нам на hello@fabulka.com — разберёмся.",
      kk: "Жаңасын жасаңыз: жауаптарды, тақырыпты не әдістемені өзгертіңіз. Бірдеңе дұрыс болмаса, hello@fabulka.com поштасына жазыңыз — көмектесеміз.",
      en: "Make another one: change the answers, the topic or the method. If something went wrong, write to hello@fabulka.com and we'll sort it out.",
    },
  },
];
