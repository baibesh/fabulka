import type { Book as BookRow } from '@prisma/client';
import {
  BOOK_THEMES,
  DEFAULT_FORMATS,
  bookFormatOf,
  newLayout,
  type BookLayout,
} from '@fabulka/shared';

/** A layout in the fairy theme at the default format, with changes. */
export const layout = (patch: Partial<BookLayout> = {}): BookLayout => ({
  ...newLayout(BOOK_THEMES.fairy, 6, bookFormatOf(DEFAULT_FORMATS[0])),
  ...patch,
});

/** A finished Russian book: Тимур and the snow leopard, with a toy and a parent's photo. */
export function sourceRow(patch: Partial<BookRow> = {}): BookRow {
  return {
    id: 'src',
    status: 'done',
    progress: 100,
    child: {
      name: 'Тимур',
      age: 6,
      gender: 'boy',
      interests: ['горы'],
      city: 'Алматы',
      language: 'ru',
    },
    language: 'ru',
    methodology: 'adventure-quest',
    theme: null,
    templateId: 't1',
    answers: { pet: 'нет' },
    title: 'Тайна снежного барса',
    heroDescription: 'a 6-year-old boy in a red jacket',
    heroResponseId: 'resp-hero',
    heroImagePath: 'books/src/hero.jpeg',
    toyName: 'Бусинка',
    toyPhotoPath: 'books/src/toy-photo.jpg',
    toyCutoutPath: 'books/src/toy-cutout.jpg',
    toyDescription: 'a plush leopard',
    toyImagePath: 'books/src/toy.jpeg',
    petImagePath: null,
    coverImagePath: null,
    coverSubject: null,
    coverTone: null,
    blurb: null,
    pages: [
      {
        page: 1,
        text: 'Тимур проснулся рано.',
        scenePrompt: 'the hero wakes up',
        imagePath: 'books/src/page-1.jpeg',
        subject: null,
        tone: null,
      },
      {
        page: 2,
        text: '«Пойдём в горы!» - сказал Тимур.',
        scenePrompt: 'the hero in the mountains',
        imagePath: 'books/src/page-2.jpeg',
        subject: null,
        tone: null,
      },
    ],
    talkQuestions: ['Что ты увидел?', 'Кого ты встретил?'],
    layout: layout({
      dedication: 'Тимуру от мамы',
      photo: {
        path: 'books/src/photo-ab.jpg',
        caption: 'Тимур летом',
        aspect: 1,
      },
      pages: {
        '1': {
          options: ['split'],
          pin: 'split',
          choice: null,
          tooFull: ['overlay-bottom'],
          noArt: false,
          focus: { x: 0.5, y: 0.5 },
          aspect: 1.5,
          ink: {},
          plateBand: 'bottom',
          spreadSide: 'right',
        },
      },
    }),
    pdfPath: 'books/src/book.pdf',
    error: null,
    generation: null,
    costUsd: 0.4,
    clientKey: 'parent',
    userId: 'u1',
    demo: false,
    country: 'KZ',
    createdAt: new Date('2026-10-01'),
    updatedAt: new Date('2026-10-01'),
    ...patch,
  };
}
