import {
  GRID,
  beatOf,
  countWords,
  encodeGrid,
  transliterate,
  type Language,
  type ModelCallKind,
  type PageSubject,
  type Story,
} from '@fabulka/shared';
import { type CallJournal, NO_JOURNAL } from '../journal/journal.service';
import type {
  GeneratedImage,
  GeneratedStory,
  ModelGateway,
  PrefillFields,
  ReferenceImage,
} from './model-gateway';
import type { BookTranslation } from '../examples/translation';
import type {
  PrefillBrief,
  SceneRewriteBrief,
  ShortenBrief,
  StoryBrief,
  TranslationBrief,
} from './prompts';

const COLORS = [
  '#F9D9A8',
  '#BFE3D0',
  '#C9D7F2',
  '#F5C6D6',
  '#E2D4F0',
  '#FCE9A4',
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function placeholder(label: string, color: string): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768" viewBox="0 0 768 768">` +
      `<rect width="768" height="768" fill="${color}"/>` +
      `<circle cx="384" cy="330" r="120" fill="#ffffff" opacity="0.7"/>` +
      `<text x="384" y="560" font-family="sans-serif" font-size="44" text-anchor="middle" fill="#3b3b3b">${escapeXml(label)}</text>` +
      `</svg>`,
  );
}

const MOCK_TEXT: Record<
  Language,
  {
    title: (name: string) => string;
    page: (n: number, name: string, city: string) => string;
    questions: string[];
    blurb: (name: string) => string;
  }
> = {
  ru: {
    title: (name) => `${name} и звёздное путешествие`,
    blurb: (name) =>
      `${name} отправляется туда, где светят звёзды. Что ждёт в пути?`,
    page: (n, name, city) =>
      `Страница ${n}. ${name} отправляется в новое приключение в городе ${city}.`,
    questions: [
      'Что случилось в книге?',
      'Кого ты видишь на картинке?',
      'А что бы сделал ты?',
    ],
  },
  kk: {
    title: (name) => `${name} және жұлдызды сапар`,
    blurb: (name) =>
      `${name} жұлдыздар жарқыраған жерге аттанады. Жолда не күтіп тұр?`,
    page: (n, name, city) =>
      `${n}-бет. ${name} ${city} қаласында жаңа шытырман оқиғаны бастайды.`,
    questions: [
      'Кітапта не болды?',
      'Суретте кімді көріп тұрсың?',
      'Сен не істер едің?',
    ],
  },
  en: {
    title: (name) => `${name} and the Starry Journey`,
    blurb: (name) =>
      `${name} sets off to where the stars shine. What waits on the way?`,
    page: (n, name, city) =>
      `Page ${n}. ${name} sets off on a new adventure in ${city}.`,
    questions: [
      'What happened in the book?',
      'Who do you see in the picture?',
      'What would you do?',
    ],
  },
  es: {
    title: (name) => `${name} y el viaje de las estrellas`,
    blurb: (name) =>
      `${name} parte hacia donde brillan las estrellas. ¿Qué le espera en el camino?`,
    page: (n, name, city) =>
      `Página ${n}. ${name} empieza una nueva aventura en ${city}.`,
    questions: [
      '¿Qué pasó en el libro?',
      '¿A quién ves en el dibujo?',
      '¿Y tú qué harías?',
    ],
  },
  de: {
    title: (name) => `${name} und die Sternenreise`,
    blurb: (name) =>
      `${name} macht sich auf zu den Sternen. Was wartet unterwegs?`,
    page: (n, name, city) =>
      `Seite ${n}. ${name} bricht in ${city} zu einem neuen Abenteuer auf.`,
    questions: [
      'Was ist im Buch passiert?',
      'Wen siehst du auf dem Bild?',
      'Was würdest du tun?',
    ],
  },
};

/** The placeholder's disc (centre 384,330, radius 120 of 768) as a SAM mask. */
export const MOCK_SUBJECT: PageSubject = {
  box: { x: 264 / 768, y: 210 / 768, w: 240 / 768, h: 240 / 768 },
  grid: encodeGrid(
    Array.from({ length: GRID * GRID }, (_, i) => {
      const x = ((i % GRID) + 0.5) / GRID;
      const y = (Math.floor(i / GRID) + 0.5) / GRID;
      return Math.hypot(x - 384 / 768, y - 330 / 768) <= 120 / 768;
    }),
  ),
};

/**
 * An interest that makes the mock's story put a fall on page 2 (page 1 of a one-page book) that the
 * mock's image model refuses in every version, gentler and rewritten: for the E2E flow and tests of
 * a page left without its picture.
 */
export const MOCK_REFUSE_INTEREST = 'mock-refuse';
const REFUSE_MARK = '[mock-refuse]';

/**
 * An interest that slows the mock down for one book, so an E2E flow can watch the progress screen:
 * the story takes a moment, the hero sheet longer, and page n takes n × SLOW_PAGE_MS, so the pages
 * finish one by one. The pages step lasts about 25 s (a refused page 2 is tried three times, 8 s
 * each): the flow's checks of the steps before it take some 15 s, polling included, and the pages
 * must still be drawing when it gets there, on a slow CI runner too.
 */
export const MOCK_SLOW_INTEREST = 'mock-slow';
const SLOW_MARK = '[mock-slow]';
const SLOW_STORY_MS = 1500;
const SLOW_SHEET_MS = 2500;
const SLOW_PAGE_MS = 4000;
const slowedBy = (prompt: string, ms: number) =>
  prompt.includes(SLOW_MARK) ? sleep(ms) : Promise.resolve();

/** Muse Image's safety refusal, as the SDK throws it. */
export function mockRefusal(): Error {
  return Object.assign(
    new Error(
      '400 The response was filtered due to the prompt triggering our content management policy.',
    ),
    { status: 400 },
  );
}

/** What the mock "hears" in any recording, and the fields it pulls out of it. */
export const MOCK_TRANSCRIPT =
  'Нашу дочку зовут Алия, ей пять лет, мы живём в Алматы, она любит динозавров и рисование, ' +
  'у нас есть кот Барсик';

/**
 * The theme the mock "proposes": a calm forest look within every limit. A brief asking for pale or
 * low-contrast colors gets pale ink, which the contrast check refuses (for the E2E flow).
 */
export function mockTheme(brief: string) {
  const pale = /pale|low.contrast|бледн|блёкл|нечитаем/i.test(brief);
  const scale = (bodyPt: number, maxWords: number, titlePt: number) => ({
    bodyPt,
    lineHeight: 1.42,
    titlePt,
    headingPt: Math.round(titlePt * 0.7),
    maxWords,
  });
  return {
    name: {
      ru: 'Лесная поляна',
      kk: 'Орман алаңы',
      en: 'Forest Glade',
      es: 'Claro del bosque',
      de: 'Waldlichtung',
    },
    fonts: {
      heading: { family: 'Comfortaa', weight: 700 },
      body: { family: 'Literata', weight: 400 },
    },
    palette: {
      paper: '#f6f8ef',
      ink: pale ? '#c9cfc0' : '#22331f',
      accent: '#3f7d4e',
      muted: '#5d6b58',
      cover: '#dfeacf',
      plate: '#f6f8ef',
    },
    sizes: {
      young: scale(20, 25, 34),
      middle: scale(16, 50, 32),
      older: scale(13.5, 75, 30),
    },
    variants: ['overlay-bottom', 'split', 'facing'],
    textSpace: 'bottom',
    cover: 'framed',
    ornament: 'leaf',
    ornamentPrompt:
      'a small round wreath of green leaves and tiny white flowers, flat children-book illustration',
  };
}

/** The mock's ornament: a leaf wreath on a transparent background. */
const MOCK_ORNAMENT = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">` +
    `<circle cx="128" cy="128" r="84" fill="none" stroke="#3f7d4e" stroke-width="10"/>` +
    Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2;
      const x = 128 + Math.cos(a) * 84;
      const y = 128 + Math.sin(a) * 84;
      return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="22" ry="11" transform="rotate(${((a * 180) / Math.PI + 90).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="#6aa86f"/>`;
    }).join('') +
    `<circle cx="128" cy="44" r="10" fill="#f4d35e"/></svg>`,
);

/** Canned model output: no network, no cost, same result every run. */
export class MockGateway implements ModelGateway {
  /**
   * `staffCostUsd` is what the mock charges for a call staff start (a translation, a theme
   * proposal), so E2E runs can reach a staff daily cap (MOCK_STAFF_COST_USD); everything else is free.
   */
  constructor(
    private readonly delayMs: number,
    private readonly journal: CallJournal = NO_JOURNAL,
    private readonly staffCostUsd = 0,
  ) {}

  /** Takes as long as the mock is told to and records the call, so the journal works offline too. */
  private async pretend(
    kind: ModelCallKind,
    images = 0,
    costUsd = 0,
    references: ReferenceImage[] = [],
  ): Promise<void> {
    const call = this.journal.start({
      kind,
      model: 'mock',
      references: references.map((r) => r.id),
    });
    await sleep(this.delayMs);
    call.ok({ costUsd, images });
  }

  async writeStory({
    child,
    pageCount,
    template,
    toy,
    methodology,
  }: StoryBrief): Promise<GeneratedStory> {
    const asked = (interest: string) =>
      child.interests.some((i) => i.trim().toLowerCase() === interest);
    const slow = asked(MOCK_SLOW_INTEREST) ? ` ${SLOW_MARK}` : '';
    if (slow) await sleep(SLOW_STORY_MS);
    await this.pretend('story');
    const text = MOCK_TEXT[child.language];
    const refused = asked(MOCK_REFUSE_INTEREST) ? Math.min(2, pageCount) : 0;
    const story: Story = {
      title: template
        ? `${child.name}: ${template.title}`
        : text.title(child.name),
      hero_description: `a ${child.age}-year-old ${child.gender} with dark hair, yellow raincoat, red boots${slow}`,
      pet_description: child.pet ? 'a small ginger cat with white paws' : null,
      pages: Array.from({ length: pageCount }, (_, i) => ({
        page: i + 1,
        beat:
          beatOf(undefined, i + 1, pageCount, methodology.structure.length) ??
          undefined,
        text: text.page(i + 1, child.name, child.city),
        scene_prompt:
          i + 1 === refused
            ? `the hero tumbling off a skateboard in ${child.city}, scene ${i + 1} ${REFUSE_MARK}${slow}`
            : `the hero${toy ? ' and the toy' : ''} exploring ${child.city}, scene ${i + 1}${slow}`,
      })),
      talk_questions: text.questions,
      cover_scene: `the hero laughing on a hill above ${child.city}${slow}`,
      blurb: text.blurb(child.name),
    };
    return { story, costUsd: 0 };
  }

  async reviewStory() {
    await this.pretend('review');
    return { safe: true, reason: 'mock review', costUsd: 0 };
  }

  async findToy(photo: Buffer) {
    await this.pretend('toy-cutout', 1);
    return { cutout: photo, costUsd: 0 };
  }

  async describeToy() {
    await this.pretend('toy-describe');
    return {
      description: 'a small plush bunny with a red knitted scarf',
      costUsd: 0,
    };
  }

  async drawToy(): Promise<GeneratedImage> {
    await this.pretend('toy-sheet', 1);
    return {
      data: placeholder('toy', '#FFFFFF'),
      ext: 'svg',
      ref: 'mock-toy',
      costUsd: 0,
    };
  }

  async drawHero(
    description = '',
    _style?: string,
    references: ReferenceImage[] = [],
  ): Promise<GeneratedImage> {
    await slowedBy(description, SLOW_SHEET_MS);
    await this.pretend('hero', 1, 0, references);
    return {
      data: placeholder('hero', '#FFFFFF'),
      ext: 'svg',
      ref: 'mock-hero',
      costUsd: 0,
    };
  }

  async drawPet(): Promise<GeneratedImage> {
    await this.pretend('pet', 1);
    return {
      data: placeholder('pet', '#FFFFFF'),
      ext: 'svg',
      ref: 'mock-pet',
      costUsd: 0,
    };
  }

  async transcribe() {
    await this.pretend('voice-transcribe');
    return { text: MOCK_TRANSCRIPT, costUsd: 0 };
  }

  /** The same child every time; a template's choice questions get their first option. */
  async extractPrefill({
    questions = [],
    theme,
  }: PrefillBrief): Promise<{ fields: PrefillFields; costUsd: number }> {
    await this.pretend('voice-extract');
    const answers = Object.fromEntries(
      questions.flatMap((q) =>
        q.kind === 'choice' && q.options?.length ? [[q.key, q.options[0]]] : [],
      ),
    );
    return {
      fields: {
        child: {
          name: 'Алия',
          age: 5,
          gender: 'girl',
          interests: ['динозавры', 'рисование'],
          pet: 'кот Барсик',
          city: 'Алматы',
        },
        ...(theme && { theme: 'динозавры и рисование' }),
        ...(Object.keys(answers).length && { answers }),
      },
      costUsd: 0,
    };
  }

  /**
   * The same book every time in the target language: the child's name (and city, and toy's name)
   * spelled in its script letter by letter, the mock's title and pages in that language, its talk
   * questions as many as the original's, the dedication and caption marked with the language.
   */
  async translateBook(
    brief: TranslationBrief,
  ): Promise<{ translation: BookTranslation; costUsd: number }> {
    await this.pretend('translate', 0, this.staffCostUsd);
    const text = MOCK_TEXT[brief.to];
    const name = transliterate(brief.child.name, brief.to);
    const city = transliterate(brief.child.city, brief.to);
    return {
      translation: {
        title: text.title(name),
        child_name: name,
        city,
        toy_name: brief.toyName ? transliterate(brief.toyName, brief.to) : null,
        pages: brief.pages.map((p) => ({
          page: p.page,
          text: text.page(p.page, name, city),
        })),
        talk_questions: brief.talkQuestions.map(
          (_, i) => text.questions[i % text.questions.length],
        ),
        dedication: brief.dedication
          ? `[${brief.to}] ${brief.dedication}`
          : null,
        photo_caption: brief.photoCaption
          ? `[${brief.to}] ${brief.photoCaption}`
          : null,
      },
      costUsd: this.staffCostUsd,
    };
  }

  /** The page's first words, as many as allowed. */
  async shortenPage({ text, maxWords }: ShortenBrief) {
    await this.pretend('shorten');
    const words = text.split(/\s+/u).filter(Boolean);
    return {
      text:
        countWords(text) <= maxWords
          ? text
          : words.slice(0, maxWords).join(' '),
      costUsd: 0,
    };
  }

  async proposeTheme(brief: string) {
    await this.pretend('theme', 0, this.staffCostUsd);
    return { proposal: mockTheme(brief), costUsd: this.staffCostUsd };
  }

  async drawOrnament(): Promise<GeneratedImage> {
    await this.pretend('ornament', 1);
    return {
      data: MOCK_ORNAMENT,
      ext: 'svg',
      ref: 'mock-ornament',
      costUsd: 0,
    };
  }

  /**
   * The hero is the white disc every placeholder page draws: the same mask, every run. Two journal
   * entries, like the real SAM calls (people, then animals).
   */
  async findSubject(
    _image?: Buffer,
    _ext?: GeneratedImage['ext'],
    kind: 'page-mask' | 'cover-mask' = 'page-mask',
  ): Promise<{ subject: PageSubject; costUsd: number }> {
    await Promise.all([this.pretend(kind, 1), this.pretend(kind, 1)]);
    return { subject: MOCK_SUBJECT, costUsd: 0 };
  }

  /** The mock's safe version keeps the refused mark: a refused page stays refused. */
  async rewriteScene({ scene }: SceneRewriteBrief) {
    await this.pretend('scene-rewrite');
    return { scene: `the hero standing calmly, ${scene}`, costUsd: 0 };
  }

  /** The cover's placeholder: the same white disc as the pages, so SAM's mock mask fits it too. */
  async drawCover(
    coverScene: string,
    _anchorRef?: string,
    _companions?: unknown,
    _style?: string,
    references: ReferenceImage[] = [],
  ): Promise<GeneratedImage> {
    await slowedBy(coverScene, SLOW_SHEET_MS);
    await this.pretend('cover', 1, 0, references);
    return {
      data: placeholder('cover', '#CFE6F5'),
      ext: 'svg',
      ref: 'mock-cover',
      costUsd: 0,
    };
  }

  async drawPage(
    scenePrompt: string,
    _anchorRef?: string,
    _companions?: unknown,
    _style?: string,
    _textSpace?: unknown,
    references: ReferenceImage[] = [],
  ): Promise<GeneratedImage> {
    const n = Number(/scene (\d+)/.exec(scenePrompt)?.[1] ?? 1);
    await slowedBy(scenePrompt, n * SLOW_PAGE_MS);
    if (scenePrompt.includes(REFUSE_MARK)) {
      const call = this.journal.start({
        kind: 'page',
        model: 'mock',
        prompt: scenePrompt,
      });
      await sleep(this.delayMs);
      const error = mockRefusal();
      call.fail(error);
      throw error;
    }
    await this.pretend('page', 1, 0, references);
    return {
      data: placeholder(`page ${n}`, COLORS[(n - 1) % COLORS.length]),
      ext: 'svg',
      ref: `mock-page-${n}`,
      costUsd: 0,
    };
  }
}
