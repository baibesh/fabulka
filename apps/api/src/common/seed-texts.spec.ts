import { DEFAULT_METHODOLOGIES } from '@fabulka/shared';
import { SEEDED_METHOD_TEXTS_V1 } from '../methodologies/seeded';
import { SEED_TRANSLATIONS } from '../templates/catalog-i18n';
import { SEEDED_TRANSLATIONS_V1 } from '../templates/seeded';
import { seedTextUpdates, type SeedTexts } from './seed-texts';

const none = (text: unknown) => !text;

describe('seedTextUpdates', () => {
  const seed: SeedTexts = { kk: { t: 'жаңа' }, es: { t: 'nuevo' } };

  it('fills in an added language the row has no text in', () => {
    expect(seedTextUpdates({ kk: { t: 'жаңа' } }, seed, [], none)).toEqual([
      'es',
    ]);
  });

  it('replaces a text still equal to an older seed, whatever its key order', () => {
    const older = { kk: { t: 'ескі', n: 1 } };
    expect(
      seedTextUpdates({ kk: { n: 1, t: 'ескі' } }, seed, [older], none),
    ).toEqual(['kk', 'es']);
  });

  it('keeps a text the admin wrote and one already up to date', () => {
    const stored = { kk: { t: 'әкімші' }, es: { t: 'nuevo' } };
    expect(
      seedTextUpdates(stored, seed, [{ kk: { t: 'ескі' } }], none),
    ).toEqual([]);
  });

  it('brings every proofread method text and catalog translation to today’s seed', () => {
    for (const [slug, old] of Object.entries(SEEDED_METHOD_TEXTS_V1)) {
      const today = DEFAULT_METHODOLOGIES.find((m) => m.slug === slug)!.texts;
      expect(seedTextUpdates({ ...today, ...old }, today, [old], none)).toEqual(
        Object.keys(old),
      );
    }
    for (const [slug, old] of Object.entries(SEEDED_TRANSLATIONS_V1)) {
      const today = SEED_TRANSLATIONS[slug];
      expect(seedTextUpdates({ ...today, ...old }, today, [old], none)).toEqual(
        Object.keys(old),
      );
    }
  });
});
