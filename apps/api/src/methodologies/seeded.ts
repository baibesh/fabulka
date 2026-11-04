import type { SeedTexts } from '../common/seed-texts';

/**
 * Frozen copies of seed method texts, exactly as the API once stored them, by slug. On start a
 * stored text still equal to one was never edited in the admin, so it takes today’s seed text
 * (see seedTextUpdates). Never edit these: add a new copy when a seed text changes again.
 */

/**
 * The names and summaries the Kazakh, Spanish and German proofreading changed, as seeded until
 * then (seed of commit 904ced9 and earlier); only the languages it changed.
 */
export const SEEDED_METHOD_TEXTS_V1: Record<string, SeedTexts> = {
  'toddler-routine': {
    kk: {
      name: 'Кішкентайларға арналған қайталау мен ырғақ',
      summary:
        'Қайталанатын сөз тіркесі, дыбыстар және кішкентай мейірімді тосынсыйы бар таныс күн.',
    },
    es: {
      name: 'Ritmo y repetición para los más pequeños',
      summary:
        'Un día conocido con una frase que se repite, sonidos para decir en voz alta y una pequeña sorpresa bonita.',
    },
  },
  'social-story': {
    kk: {
      name: 'Әлеуметтік әңгіме',
      summary:
        'Жаңа жағдайға сабырмен дайындайды: балабақша, дәрігер, ұшақ, көшу, інісі не сіңлісі.',
    },
  },
  'sel-emotions': {
    kk: {
      name: 'Эмоциялық интеллект',
      summary:
        'Кейіпкер сезімдерін байқап, атауды, сабырға келуді және басқаларды түсінуді үйренеді.',
    },
    de: {
      name: 'Emotionale Intelligenz',
      summary:
        'Die Hauptfigur lernt, Gefühle zu bemerken und zu benennen, sich zu beruhigen und andere zu verstehen.',
    },
  },
  'growth-mindset': {
    kk: {
      name: 'Даму ойлауы',
      summary:
        'Шықпады - әзірге. Кейіпкер байқап, қателесіп, жол іздейді және еңбекпен мақсатына жетеді.',
    },
    de: {
      name: 'Wachstumsdenken',
      summary:
        '„Ich kann das nicht“ – noch nicht! Die Hauptfigur probiert, macht Fehler, findet einen Weg und schafft es mit Ausdauer.',
    },
  },
};
