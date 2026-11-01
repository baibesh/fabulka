import {
  GRID,
  encodeGrid,
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
import type { PrefillBrief, StoryBrief } from './prompts';

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

  /** The hero is the white disc every placeholder page draws: the same mask, every run. */
  async findSubject(): Promise<{ subject: PageSubject; costUsd: number }> {
    await this.pretend('page-mask', 1);
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
