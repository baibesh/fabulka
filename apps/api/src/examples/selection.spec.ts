import {
  orSamples,
  pickExamples,
  templateCountriesOf,
  type Candidate,
  type CandidateVersion,
} from './selection';

const version = (
  language: string,
  status = 'done',
  title: string | null = `Book ${language}`,
): CandidateVersion => ({
  language,
  bookId: `book-${language}-${status}`,
  title,
  status,
  heroImagePath: null,
});

const example = (
  id: string,
  versions: CandidateVersion[],
  countries: string[] = [],
  templateCountries: string[] | null = null,
): Candidate => ({ id, countries, templateCountries, versions });

describe('pickExamples', () => {
  it('shows each example in exactly the page language, never another one', () => {
    const examples = [
      example('ru-only', [version('ru')]),
      example('both', [version('ru'), version('en')]),
      example('en-only', [version('en')]),
    ];
    const ids = (language: 'en' | 'ru' | 'es') =>
      pickExamples(examples, 'KZ', language).map(
        (p) => `${p.exampleId}:${p.version.language}`,
      );
    expect(ids('en')).toEqual(['both:en', 'en-only:en']);
    expect(ids('ru')).toEqual(['ru-only:ru', 'both:ru']);
    // No Spanish version anywhere: nothing, not an English or Russian one.
    expect(ids('es')).toEqual([]);
  });

  it('leaves out a version still translating, failed or without a title', () => {
    const examples = [
      example('translating', [version('ru'), version('en', 'story')]),
      example('failed', [version('ru'), version('en', 'failed')]),
      example('untitled', [version('en', 'done', null)]),
      example('ok', [version('en')]),
    ];
    expect(pickExamples(examples, null, 'en').map((p) => p.exampleId)).toEqual([
      'ok',
    ]);
  });

  it("filters by the example's own countries, else its catalog book's, else everywhere", () => {
    const examples = [
      example('own-kz', [version('ru')], ['KZ']),
      example('own-de-over-kz-template', [version('ru')], ['DE'], ['KZ']),
      example('template-kz', [version('ru')], [], ['KZ']),
      example('template-everywhere', [version('ru')], [], []),
      example('own-story', [version('ru')]),
    ];
    const ids = (country: string | null) =>
      pickExamples(examples, country, 'ru').map((p) => p.exampleId);
    expect(ids('KZ')).toEqual([
      'own-kz',
      'template-kz',
      'template-everywhere',
      'own-story',
    ]);
    expect(ids('DE')).toEqual([
      'own-de-over-kz-template',
      'template-everywhere',
      'own-story',
    ]);
    // "other" (and unknown codes): only the examples shown everywhere.
    expect(ids(null)).toEqual(['template-everywhere', 'own-story']);
  });

  it('keeps the given order and at most the limit, counting only those shown', () => {
    const examples = [
      ...Array.from({ length: 3 }, (_, i) =>
        example(`kz${i}`, [version('en')], ['KZ']),
      ),
      ...Array.from({ length: 14 }, (_, i) =>
        example(`all${i}`, [version('en')]),
      ),
    ];
    const picked = pickExamples(examples, 'DE', 'en');
    expect(picked).toHaveLength(12);
    expect(picked[0].exampleId).toBe('all0');
  });
});

describe('orSamples', () => {
  it('keeps the examples when there are any', () => {
    expect(orSamples(['e1'], ['s1'])).toEqual([
      { kind: 'example', item: 'e1' },
    ]);
  });

  it('fills an empty block with the catalog samples, at most the limit', () => {
    expect(orSamples([], ['s1', 's2', 's3'], 2)).toEqual([
      { kind: 'sample', item: 's1' },
      { kind: 'sample', item: 's2' },
    ]);
    expect(orSamples([], [])).toEqual([]);
  });
});

describe('templateCountriesOf', () => {
  it("takes the first version's catalog book; null for a story of its own", () => {
    expect(
      templateCountriesOf([
        { template: { countries: ['KZ'] } },
        { template: { countries: ['DE'] } },
      ]),
    ).toEqual(['KZ']);
    expect(templateCountriesOf([{ template: null }])).toBeNull();
    expect(templateCountriesOf([])).toBeNull();
  });
});
