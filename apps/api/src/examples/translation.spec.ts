import type { BookLayout } from '@fabulka/shared';
import { MockGateway } from '../meta/mock.gateway';
import {
  BookTranslationSchema,
  TRANSLATION_CLIENT_KEY,
  assembleTranslation,
  copyPlan,
  overflowingPages,
  translationBrief,
  translationProblem,
  translationRow,
} from './translation';
import { layout, sourceRow } from './examples.testing';

describe('the translation of an example book', () => {
  it('copies every picture into the new book’s folder, each once', () => {
    expect(copyPlan(sourceRow(), 'new')).toEqual([
      { from: 'books/src/hero.jpeg', to: 'books/new/hero.jpeg' },
      { from: 'books/src/toy.jpeg', to: 'books/new/toy.jpeg' },
      { from: 'books/src/toy-photo.jpg', to: 'books/new/toy-photo.jpg' },
      { from: 'books/src/toy-cutout.jpg', to: 'books/new/toy-cutout.jpg' },
      { from: 'books/src/page-1.jpeg', to: 'books/new/page-1.jpeg' },
      { from: 'books/src/page-2.jpeg', to: 'books/new/page-2.jpeg' },
      { from: 'books/src/photo-ab.jpg', to: 'books/new/photo-ab.jpg' },
    ]);
    expect(
      copyPlan(
        sourceRow({
          toyImagePath: null,
          toyPhotoPath: null,
          toyCutoutPath: null,
          layout: null,
        }),
        'new',
      ).map((c) => c.to),
    ).toEqual([
      'books/new/hero.jpeg',
      'books/new/page-1.jpeg',
      'books/new/page-2.jpeg',
    ]);
  });

  it('starts the new book as staff’s, in the target language, from the same story', () => {
    const row = translationRow(sourceRow(), 'en');
    expect(row).toMatchObject({
      status: 'queued',
      language: 'en',
      clientKey: TRANSLATION_CLIENT_KEY,
      demo: true,
      templateId: 't1',
      methodology: 'adventure-quest',
      heroDescription: 'a 6-year-old boy in a red jacket',
      child: { name: 'Тимур', language: 'en' },
    });
    expect(row).not.toHaveProperty('userId');
  });

  it('asks for the text the book prints: pages, questions, dedication, caption, within the words', () => {
    const source = sourceRow();
    const brief = translationBrief(
      source,
      'de',
      layout({ dedication: 'Тимуру от мамы' }),
      30,
    );
    expect(brief).toMatchObject({
      from: 'ru',
      to: 'de',
      child: { name: 'Тимур', age: 6, gender: 'boy', city: 'Алматы' },
      toyName: 'Бусинка',
      title: 'Тайна снежного барса',
      pages: [
        { page: 1, text: 'Тимур проснулся рано.' },
        { page: 2, text: '«Пойдём в горы!» — сказал Тимур.' },
      ],
      talkQuestions: ['Что ты увидел?', 'Кого ты встретил?'],
      dedication: 'Тимуру от мамы',
      photoCaption: null,
      wordsPerPage: 30,
    });
  });

  it('assembles the book: the name the model spelled, pages by number, pictures moved', async () => {
    const source = sourceRow();
    const base = source.layout as unknown as BookLayout;
    const brief = translationBrief(source, 'en', base, 40);
    const { translation } = await new MockGateway(0).translateBook(brief);
    expect(translation.child_name).toBe('Timur');
    // The model's own spelling is used as it is, even if it differs from a letter-by-letter one.
    const modelled = {
      ...translation,
      child_name: 'Teemur',
      // Out of order on purpose: matched by page number.
      pages: [...translation.pages].reverse(),
    };
    const book = assembleTranslation(source, modelled, 'en', 'new', base);

    expect(book.child).toMatchObject({
      name: 'Teemur',
      city: 'Almaty',
      language: 'en',
      age: 6,
    });
    expect(book.language).toBe('en');
    expect(book.title).toBe('Timur and the Starry Journey');
    expect(
      book.pages.map((p) => [p.page, p.text, p.imagePath, p.scenePrompt]),
    ).toEqual([
      [
        1,
        'Page 1. Timur sets off on a new adventure in Almaty.',
        'books/new/page-1.jpeg',
        'the hero wakes up',
      ],
      [
        2,
        'Page 2. Timur sets off on a new adventure in Almaty.',
        'books/new/page-2.jpeg',
        'the hero in the mountains',
      ],
    ]);
    expect(book.heroImagePath).toBe('books/new/hero.jpeg');
    expect(book.toyImagePath).toBe('books/new/toy.jpeg');
    expect(book.petImagePath).toBeNull();
    expect(book.toyName).toBe('Businka');
    expect(book.talkQuestions).toEqual([
      'What happened in the book?',
      'Who do you see in the picture?',
    ]);
    // The layout's own texts are translated; its pins stay, QA starts afresh.
    expect(book.layout.dedication).toBe('[en] Тимуру от мамы');
    expect(book.layout.photo).toEqual({
      path: 'books/new/photo-ab.jpg',
      caption: '[en] Тимур летом',
      aspect: 1,
    });
    expect(book.layout.pages['1']).toMatchObject({ pin: 'split', tooFull: [] });
    expect(book.layout.qa.status).toBe('pending');
    expect(book.layout.theme.id).toBe(base.theme.id);
  });

  it('keeps the default dedication the default (written in code per language)', async () => {
    const source = sourceRow();
    const base = layout({ dedication: null, photo: null });
    const { translation } = await new MockGateway(0).translateBook(
      translationBrief(source, 'kk', base, 40),
    );
    const book = assembleTranslation(
      source,
      { ...translation, dedication: 'Арнайы' },
      'kk',
      'new',
      base,
    );
    expect(book.layout.dedication).toBeNull();
    expect(book.layout.photo).toBeNull();
    expect(book.child.name).toBe('Тимур');
  });

  it('refuses a translation that does not match the book', () => {
    const source = sourceRow();
    const brief = translationBrief(
      source,
      'en',
      source.layout as unknown as BookLayout,
      40,
    );
    const good = BookTranslationSchema.parse({
      title: 'The Secret of the Snow Leopard',
      child_name: 'Timur',
      pages: [
        { page: 1, text: 'Timur woke up early.' },
        { page: 2, text: '“Let’s go to the mountains!” said Timur.' },
      ],
      talk_questions: ['What did you see?', 'Whom did you meet?'],
      dedication: 'To Timur from Mum',
      photo_caption: 'Timur in summer',
    });
    expect(translationProblem(brief, good)).toBeNull();
    expect(
      translationProblem(brief, { ...good, pages: good.pages.slice(0, 1) }),
    ).toContain('pages 1,2');
    expect(
      translationProblem(brief, { ...good, talk_questions: ['?'] }),
    ).toContain('2 questions');
    expect(translationProblem(brief, { ...good, dedication: null })).toContain(
      'dedication',
    );
    expect(
      translationProblem(brief, { ...good, photo_caption: null }),
    ).toContain('photo_caption');
  });

  it('finds the story pages render QA says still overflow', () => {
    const qa = (issues: BookLayout['qa']['issues']) =>
      layout({ qa: { status: 'blocked', checkedAt: null, issues, notes: [] } });
    expect(
      overflowingPages(
        qa([
          { page: 'story-2', kind: 'overflow', detail: '' },
          { page: 'story-4-b', kind: 'overflow', detail: '' },
          { page: 'story-4', kind: 'overflow', detail: '' },
          { page: 'story-5', kind: 'fallback-font', detail: '' },
          { page: 'talk', kind: 'overflow', detail: '' },
        ]),
      ),
    ).toEqual([2, 4]);
    expect(overflowingPages(layout())).toEqual([]);
  });
});
