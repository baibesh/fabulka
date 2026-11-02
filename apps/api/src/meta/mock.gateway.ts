import {
  GRID,
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
} from './model-gateway';
import type { BookTranslation } from '../examples/translation';
import type {
  PrefillBrief,
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
  }
> = {
  ru: {
    title: (name) => `${name} и звёздное путешествие`,
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
  constructor(
    private readonly delayMs: number,
    private readonly journal: CallJournal = NO_JOURNAL,
  ) {}

  /** Takes as long as the mock is told to and records the call, so the journal works offline too. */
  private async pretend(kind: ModelCallKind, images = 0): Promise<void> {
    const call = this.journal.start({ kind, model: 'mock' });
    await sleep(this.delayMs);
    call.ok({ costUsd: 0, images });
  }

  async writeStory({
    child,
    pageCount,
    template,
    toy,
  }: StoryBrief): Promise<GeneratedStory> {
    await this.pretend('story');
    const text = MOCK_TEXT[child.language];
    const story: Story = {
      title: template
        ? `${child.name}: ${template.title}`
        : text.title(child.name),
      hero_description: `a ${child.age}-year-old ${child.gender} with dark hair, yellow raincoat, red boots`,
      pet_description: child.pet ? 'a small ginger cat with white paws' : null,
      pages: Array.from({ length: pageCount }, (_, i) => ({
        page: i + 1,
        text: text.page(i + 1, child.name, child.city),
        scene_prompt: `the hero${toy ? ' and the toy' : ''} exploring ${child.city}, scene ${i + 1}`,
      })),
      talk_questions: text.questions,
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

  async drawHero(): Promise<GeneratedImage> {
    await this.pretend('hero', 1);
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
    await this.pretend('translate');
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
      costUsd: 0,
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
    await this.pretend('theme');
    return { proposal: mockTheme(brief), costUsd: 0 };
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
  async findSubject(): Promise<{ subject: PageSubject; costUsd: number }> {
    await Promise.all([
      this.pretend('page-mask', 1),
      this.pretend('page-mask', 1),
    ]);
    return { subject: MOCK_SUBJECT, costUsd: 0 };
  }

  async drawPage(scenePrompt: string): Promise<GeneratedImage> {
    await this.pretend('page', 1);
    const n = Number(/scene (\d+)/.exec(scenePrompt)?.[1] ?? 1);
    return {
      data: placeholder(`page ${n}`, COLORS[(n - 1) % COLORS.length]),
      ext: 'svg',
      ref: `mock-page-${n}`,
      costUsd: 0,
    };
  }
}
