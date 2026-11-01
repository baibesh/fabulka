import type { PrismaService } from '../prisma/prisma.service';
import { TemplatesService } from './templates.service';

/** A published catalog book row with what get() reads. */
const template = {
  id: 't1',
  slug: 'bath-time',
  title: 'Купание',
  summary: 'Вечер в ванной',
  ageMin: 2,
  ageMax: 4,
  methodology: 'toddler-routine',
  languages: ['ru', 'kk', 'en', 'es', 'de'],
  coverUrl: null,
  questions: [],
  translations: {},
  published: true,
};

/** A finished sample book in `language`. */
const sample = (language: string, name: string) => ({
  language,
  book: {
    id: `book-${language}`,
    child: { name, city: 'Almaty', pet: null },
    toyName: null,
    answers: {},
  },
});

function service(samples: ReturnType<typeof sample>[]) {
  const findMany = jest.fn().mockResolvedValue(samples);
  const prisma = {
    bookTemplate: { findUnique: jest.fn().mockResolvedValue(template) },
    templateSample: { findMany },
  };
  return {
    templates: new TemplatesService(prisma as unknown as PrismaService),
    findMany,
  };
}

describe('TemplatesService.get', () => {
  it('shows the sample in the visitor language', async () => {
    const { templates, findMany } = service([
      sample('ru', 'Алия'),
      sample('en', 'Aliya'),
    ]);
    const got = await templates.get('bath-time', 'en');
    expect(got.sampleBookId).toBe('book-en');
    expect(got.sampleLanguage).toBe('en');
    expect(got.sampleDetails?.name).toBe('Aliya');
    // Only finished books count.
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { templateId: 't1', book: { status: 'done' } },
      }),
    );
  });

  it('falls back in the shared order: Kazakh to Russian, Spanish and German to English', async () => {
    const { templates } = service([
      sample('ru', 'Алия'),
      sample('en', 'Aliya'),
    ]);
    expect((await templates.get('bath-time', 'kk')).sampleLanguage).toBe('ru');
    expect((await templates.get('bath-time', 'es')).sampleLanguage).toBe('en');
    expect((await templates.get('bath-time', 'de')).sampleBookId).toBe(
      'book-en',
    );
  });

  it('shows any sample there is, and none without one', async () => {
    expect(
      (await service([sample('kk', 'Алия')]).templates.get('bath-time', 'en'))
        .sampleLanguage,
    ).toBe('kk');
    const none = await service([]).templates.get('bath-time', 'ru');
    expect(none).toMatchObject({
      sampleBookId: null,
      sampleLanguage: null,
      sampleDetails: null,
    });
  });
});
