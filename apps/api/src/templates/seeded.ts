import type { SeedTexts } from '../common/seed-texts';

/**
 * Frozen copies of the starting catalog’s translations, exactly as the API once stored them, by
 * slug. On start a stored translation still equal to one was never edited in the admin, so it
 * takes today’s (see seedTextUpdates). Never edit these: add a new copy when a translation
 * changes again.
 */

/**
 * The translations the Kazakh, Spanish and German proofreading changed, as seeded until then
 * (seed of commit 904ced9 and earlier); only the languages it changed.
 */
export const SEEDED_TRANSLATIONS_V1: Record<string, SeedTexts> = {
  'first-day-kindergarten': {
    kk: {
      title: 'Балабақшадағы алғашқы күн',
      summary:
        'Балабақшада не болатынын сабырмен, ретімен айтады: қоштасу, тәрбиеші, ойындар және анамен кездесу.',
      questions: {
        toy: {
          label: 'Өзімен қандай ойыншық алады?',
          placeholder: 'жұмсақ қоян',
        },
        goodbye: {
          label: 'Таңертең қалай қоштасасыздар?',
          options: [
            'құшақтасамыз',
            'терезеден қол бұлғаймыз',
            'алақан соғамыз',
            'бетінен сүйеміз',
          ],
        },
        teacher: { label: 'Тәрбиешінің аты кім?', placeholder: 'Гүлнар апай' },
        looking_forward: {
          label: 'Бала ең көп нені күтеді?',
          options: ['ойындар', 'сурет салу', 'жаңа достар', 'серуен'],
        },
      },
    },
    de: {
      title: 'Der erste Tag in der Kita',
      summary:
        'Ganz ruhig, Schritt für Schritt: der Abschied, die Erzieherin, Spielen und der Moment, wenn Mama oder Papa wiederkommt.',
      questions: {
        toy: {
          label: 'Welches Kuscheltier kommt mit?',
          placeholder: 'ein Plüschhase',
        },
        goodbye: {
          label: 'Wie verabschiedet ihr euch morgens?',
          options: [
            'mit einer Umarmung',
            'durchs Fenster winken',
            'abklatschen',
            'ein Küsschen auf die Wange',
          ],
        },
        teacher: {
          label: 'Wie heißt die Erzieherin oder der Erzieher?',
          placeholder: 'Frau Müller',
        },
        looking_forward: {
          label: 'Worauf freut sich dein Kind am meisten?',
          options: ['Spielen', 'Malen', 'neue Freunde', 'draußen spielen'],
        },
      },
    },
  },
  'not-yet': {
    kk: {
      title: 'Мен үйренемін!',
      summary:
        'Шықпады - әзірге. Жаттығу мен жақындардың көмегі «білмеймін» дегенді «білемінге» қалай айналдыратыны туралы кітап.',
      questions: {
        skill: {
          label: 'Бала қазір не үйреніп жүр?',
          options: [
            'велосипед тебуді',
            'жүзуді',
            'оқуды',
            'бау байлауды',
            'коньки тебуді',
            'домбыра тартуды',
          ],
        },
        helper: {
          label: 'Үйренуге кім көмектеседі?',
          options: [
            'анасы',
            'әкесі',
            'атасы',
            'әжесі',
            'ағасы',
            'әпкесі',
            'жаттықтырушы',
          ],
        },
      },
    },
  },
  'big-feelings': {
    kk: {
      title: 'Ішімдегі дауыл',
      summary:
        'Күшті сезімдер туралы: оларды байқау, атау, сабырға келу және татуласу.',
      questions: {
        feeling: {
          label: 'Балаға қай сезіммен күресу қиын?',
          options: ['ашу', 'қорқыныш', 'өкпе', 'қызғаныш', 'мұң'],
        },
        trigger: {
          label: 'Бұл сезімді әдетте не тудырады?',
          placeholder: 'ағасы ойыншықтарын алғанда',
        },
        calm: {
          label: 'Сабырға келуге не көмектеседі?',
          options: [
            'құшақтасу',
            'терең дем алу',
            'беске дейін санау',
            'тыныш бұрышта отыру',
            'сурет салу',
          ],
        },
      },
    },
    es: {
      title: 'Una tormenta por dentro',
      summary:
        'Sobre las emociones grandes: cómo notarlas, ponerles nombre, calmarse y hacer las paces.',
      questions: {
        feeling: {
          label: '¿Qué emoción le cuesta más manejar?',
          options: [
            'la rabia',
            'el miedo',
            'sentirse dolido',
            'los celos',
            'la tristeza',
          ],
        },
        trigger: {
          label: '¿Qué suele provocarla?',
          placeholder: 'cuando su hermano le quita los juguetes',
        },
        calm: {
          label: '¿Qué le ayuda a calmarse?',
          options: [
            'los abrazos',
            'respirar hondo',
            'contar hasta cinco',
            'un rincón tranquilo',
            'dibujar',
          ],
        },
      },
    },
  },
  'nauryz-new-friend': {
    kk: {
      title: 'Жаңа досыммен Наурыз',
      summary:
        'Туған қаладағы көктем мейрамы: наурыз көже, киіз үй, алтыбақан және жақында басқа елден келген дос.',
      questions: {
        friend_country: {
          label: 'Жаңа дос қай елден келді?',
          options: ['Корея', 'Түркия', 'Бразилия', 'Германия', 'Жапония'],
        },
        dish: {
          label: 'Наурыздағы сүйікті тағам',
          options: ['наурыз көже', 'бауырсақ', 'бешбармақ', 'шәкшәк'],
        },
        tradition: {
          label: 'Отбасыңыздың Наурыз дәстүрі',
          placeholder: 'әжемізге қонаққа барамыз',
        },
      },
    },
  },
  'bath-time': {
    kk: {
      title: 'Былқ-сылқ, шомыламыз!',
      summary:
        'Кішкентайларға арналған кешкі ванна: ойыншықтар, көпіршіктер, қайталанатын әуен және тәтті ұйқы.',
      questions: {
        toy: { label: 'Ваннадағы сүйікті ойыншығы', placeholder: 'сары үйрек' },
        sound: {
          label: 'Су шашқанда бөбек не дейді?',
          options: ['былқ-былқ', 'шалп-шалп', 'тамшы-тамшы'],
        },
      },
    },
  },
};
