import { DEFAULT_COUNTRIES, type CountryEntry } from '@fabulka/shared';
import { describeLineup, launchLineup } from './launch-lineup';
import {
  SEEDED_COUNTRIES_V1,
  SEEDED_COUNTRIES_V2,
  SEEDED_COUNTRIES_V3,
} from './seeded';

const seed = () => structuredClone(SEEDED_COUNTRIES_V3) as CountryEntry[];

describe('launch country lineup', () => {
  it('turns the untouched 26-country seed into the nine launch countries', () => {
    const { countries, outcome } = launchLineup(seed());
    expect(countries).toEqual(DEFAULT_COUNTRIES);
    expect(countries?.map((c) => `${c.code}:${c.currency}`)).toEqual([
      'KZ:KZT',
      'US:USD',
      'CA:CAD',
      'MY:MYR',
      'AU:AUD',
      'DE:EUR',
      'AT:EUR',
      'CH:CHF',
      'ES:EUR',
    ]);
    expect(countries?.filter((c) => c.print).map((c) => c.code)).toEqual([
      'KZ',
    ]);
    expect(outcome).toEqual({
      action: 'applied',
      removed: [
        'UZ',
        'KG',
        'TJ',
        'TM',
        'AZ',
        'AM',
        'GE',
        'MD',
        'IL',
        'MN',
        'TR',
        'AE',
        'MX',
        'AR',
        'CO',
        'CL',
        'PL',
        'CZ',
        'GB',
      ],
      added: ['MY', 'AU'],
      edited: [],
    });
    expect(describeLineup(outcome)).toContain('stay stored, unused');
  });

  it('applies to the older seeds too, whatever the key order', () => {
    for (const old of [SEEDED_COUNTRIES_V1, SEEDED_COUNTRIES_V2]) {
      const reordered = (old as CountryEntry[]).map(
        ({ print, currency, languages, code }) => ({
          print,
          currency,
          languages,
          code,
        }),
      );
      expect(launchLineup(reordered).countries).toEqual(DEFAULT_COUNTRIES);
    }
  });

  it("keeps Kazakhstan as stored, Germany's print and payment providers of the kept countries", () => {
    const list = seed().map((c) =>
      c.code === 'KZ'
        ? { ...c, languages: ['ru', 'kk', 'en'] as CountryEntry['languages'] }
        : c.code === 'DE'
          ? { ...c, print: true }
          : c.code === 'US'
            ? { ...c, payment: 'stripe' as const }
            : c.code === 'UZ'
              ? { ...c, print: true }
              : c,
    );
    const { countries, outcome } = launchLineup(list);
    expect(countries?.[0]).toEqual(list[0]);
    expect(countries?.find((c) => c.code === 'DE')).toEqual({
      code: 'DE',
      languages: ['de', 'en'],
      currency: 'EUR',
      print: true,
    });
    expect(countries?.find((c) => c.code === 'US')?.payment).toBe('stripe');
    expect(countries?.find((c) => c.code === 'AT')?.print).toBe(false);
    // Uzbekistan's edit goes with it; only the kept countries' edits are reported.
    expect(outcome).toMatchObject({ edited: ['KZ', 'DE', 'US'] });
  });

  it('skips a list the owner reshaped and says so', () => {
    const list = seed().filter((c) => c.code !== 'UZ');
    const { countries, outcome } = launchLineup(list);
    expect(countries).toBeNull();
    expect(outcome).toMatchObject({ action: 'skipped', reason: 'edited' });
    expect(describeLineup(outcome)).toContain('NOT applied');

    const added = [
      ...seed(),
      { code: 'FR', languages: ['en'], currency: 'EUR', print: false },
    ];
    expect(launchLineup(added).countries).toBeNull();
  });

  it('leaves the lineup itself, and anything that is not a list, alone', () => {
    expect(launchLineup(structuredClone(DEFAULT_COUNTRIES))).toEqual({
      countries: null,
      outcome: { action: 'already' },
    });
    expect(launchLineup({ nope: true }).outcome).toMatchObject({
      action: 'skipped',
      reason: 'invalid',
    });
  });
});
