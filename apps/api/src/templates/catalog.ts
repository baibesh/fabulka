import type { TemplateQuestion } from '@fabulka/shared';

export interface SeedTemplate {
  slug: string;
  title: string;
  summary: string;
  ageMin: number;
  ageMax: number;
  /** A slug from DEFAULT_METHODOLOGIES (@fabulka/shared), seeded alongside. */
  methodology: string;
  theme: string;
  plot: string[];
  questions: TemplateQuestion[];
  stylePrompt?: string;
  /** Muse Image prompt for the catalog cover (scripts/catalog-covers.ts). */
  coverPrompt: string;
  /** Country codes where the catalog lists it (BookTemplate.countries); left out: everywhere. */
  countries?: string[];
}

/**
 * The catalog the service starts with, one book per story method. Inserted when the slug is
 * missing, so edits made later in the admin are never overwritten.
 */
export const SEED_TEMPLATES: SeedTemplate[] = [
  {
    slug: 'first-day-kindergarten',
    title: 'Первый день в детском саду',
    summary:
      'Спокойно и по шагам рассказывает, что будет в садике: прощание, воспитатель, игры и встреча с мамой.',
    ageMin: 2,
    ageMax: 6,
    methodology: 'social-story',
    theme: "the hero's first day at kindergarten",
    plot: [
      'Morning at home: getting ready and packing a favourite toy.',
      'Arriving at the kindergarten with a parent and saying goodbye in their own special way.',
      'Meeting the teacher and seeing the group room.',
      'The day step by step: breakfast, play, a walk outside, nap time.',
      'Making a first friend.',
      'The parent comes back as promised and the hero tells what they did.',
    ],
    questions: [
      {
        key: 'toy',
        label: 'Какую игрушку возьмёт с собой?',
        kind: 'text',
        required: true,
        placeholder: 'плюшевый зайка',
      },
      {
        key: 'goodbye',
        label: 'Как вы прощаетесь утром?',
        kind: 'choice',
        options: [
          'обнимаемся',
          'машем в окно',
          'даём «пять»',
          'целуем в щёчку',
        ],
        required: true,
      },
      {
        key: 'teacher',
        label: 'Как зовут воспитателя?',
        kind: 'text',
        required: false,
        placeholder: 'Гульнара апай',
      },
      {
        key: 'looking_forward',
        label: 'Чего ребёнок ждёт больше всего?',
        kind: 'choice',
        options: ['игры', 'рисование', 'новые друзья', 'прогулка'],
        required: false,
      },
    ],
    coverPrompt:
      'a small child with a backpack holding a parent hand at the door of a bright, friendly kindergarten, morning sun, toys visible through the window',
  },
  {
    slug: 'snow-leopard-alatau',
    // About Kazakhstan: listed only there (migration z14_template_countries for older databases).
    countries: ['KZ'],
    title: 'Тайна снежного барса',
    summary:
      'Путешествие в горы Алатау: беркут, туман, горное озеро и потерявшийся детёныш снежного барса.',
    ageMin: 4,
    ageMax: 10,
    methodology: 'adventure-quest',
    theme:
      'an adventure in the Ile-Alatau mountains near Almaty to help a lost snow leopard cub find its mother',
    plot: [
      'At home the hero finds a mysterious paw-print map.',
      'A golden eagle offers to fly the hero to the mountains.',
      'They land in the snowy mountains by the turquoise Big Almaty Lake.',
      'Two small challenges, crossing a stream on stones and finding the way in fog, solved with the hero’s interests.',
      'The hero finds the lost snow leopard cub and calms it with kindness.',
      'The hero brings the cub back to its mother, who thanks them.',
      'The eagle flies the hero home; a white feather is their gift.',
    ],
    questions: [
      {
        key: 'friend',
        label: 'Лучший друг, который отправится в путь вместе с героем',
        kind: 'text',
        required: false,
        placeholder: 'Даник',
      },
      {
        key: 'dream',
        label: 'Кем ребёнок мечтает стать?',
        kind: 'text',
        required: false,
        placeholder: 'спасателем',
      },
      {
        key: 'color',
        label: 'Любимый цвет',
        kind: 'choice',
        options: [
          'красный',
          'синий',
          'зелёный',
          'жёлтый',
          'фиолетовый',
          'розовый',
        ],
        required: false,
      },
    ],
    stylePrompt:
      "children's picture-book illustration, soft watercolor, snowy mountain blues with warm golden light, " +
      'gentle rounded shapes, no text, no letters',
    coverPrompt:
      'a child and a fluffy snow leopard cub sitting together on a snowy mountain ridge above a turquoise lake, a golden eagle in the sky',
  },
  {
    slug: 'not-yet',
    title: 'Я научусь!',
    summary:
      'Не получилось — пока. Книга о том, как тренировка и помощь близких превращают «не умею» в «умею».',
    ageMin: 5,
    ageMax: 10,
    methodology: 'growth-mindset',
    theme: 'learning a hard new skill through practice',
    plot: [
      'The hero sees someone do the skill and wants to learn it too.',
      'The first try goes wrong; the hero is upset and says "I can’t".',
      'The helper tells how they once could not do it either and adds the word "yet".',
      'The hero practises every day, trying a new way each time; small progress.',
      'The big moment: the hero succeeds thanks to practice.',
      'The hero helps a younger child: "You can’t do it yet, but you will".',
    ],
    questions: [
      {
        key: 'skill',
        label: 'Чему ребёнок учится сейчас?',
        kind: 'choice',
        options: [
          'кататься на велосипеде',
          'плавать',
          'читать',
          'завязывать шнурки',
          'кататься на коньках',
          'играть на домбре',
        ],
        required: true,
      },
      {
        key: 'helper',
        label: 'Кто помогает учиться?',
        kind: 'choice',
        options: [
          'мама',
          'папа',
          'ата',
          'апа',
          'старший брат',
          'старшая сестра',
          'тренер',
        ],
        required: true,
      },
    ],
    coverPrompt:
      'a determined child learning to ride a bicycle in a sunny park, a grown-up running alongside and cheering',
  },
  {
    slug: 'big-feelings',
    title: 'Когда внутри буря',
    summary:
      'Про сильные чувства: как их заметить, назвать, успокоиться и помириться.',
    ageMin: 4,
    ageMax: 8,
    methodology: 'sel-emotions',
    theme: 'a big feeling and how to handle it',
    plot: [
      'A happy morning; then something goes wrong and a big feeling grows inside like a storm cloud.',
      'The hero notices where the feeling lives in the body and names it.',
      'A grown-up sits next to the hero and says the feeling is okay.',
      'The hero tries a calming trick and the storm cloud gets smaller.',
      'The hero thinks about how the other person felt and finds a way to make things right.',
      'Evening: the hero remembers the trick for next time.',
    ],
    questions: [
      {
        key: 'feeling',
        label: 'С каким чувством ребёнку сложнее всего?',
        kind: 'choice',
        options: ['злость', 'страх', 'обида', 'ревность', 'грусть'],
        required: true,
      },
      {
        key: 'trigger',
        label: 'Что обычно вызывает это чувство?',
        kind: 'text',
        required: false,
        placeholder: 'когда брат берёт игрушки',
      },
      {
        key: 'calm',
        label: 'Что помогает успокоиться?',
        kind: 'choice',
        options: [
          'обнимашки',
          'глубоко подышать',
          'посчитать до пяти',
          'побыть в тихом уголке',
          'порисовать',
        ],
        required: false,
      },
    ],
    coverPrompt:
      'a child hugging a soft toy while a small grey storm cloud above their head turns into a rainbow, cozy room',
  },
  {
    slug: 'nauryz-new-friend',
    // About Kazakhstan: listed only there (migration z14_template_countries for older databases).
    countries: ['KZ'],
    title: 'Наурыз с новым другом',
    summary:
      'Весенний праздник в родном городе: наурыз-коже, юрта, качели алтыбакан и друг, который недавно приехал из другой страны.',
    ageMin: 4,
    ageMax: 10,
    methodology: 'mirrors-windows',
    theme:
      "celebrating Nauryz in the hero's city with a new friend who has just moved from another country",
    plot: [
      'Spring in the hero’s city: the family prepares for Nauryz.',
      'A new neighbour child who has just moved from another country watches shyly.',
      'The hero invites the new friend; they help cook nauryz kozhe and baursaks.',
      'The new friend shares a tradition from their own country.',
      'At the city celebration: a yurt, dombra music and altybakan swings.',
      'Both families celebrate together; the friends teach each other a word in their languages.',
    ],
    questions: [
      {
        key: 'friend_country',
        label: 'Откуда приехал новый друг?',
        kind: 'choice',
        options: ['Корея', 'Турция', 'Бразилия', 'Германия', 'Япония'],
        required: true,
      },
      {
        key: 'dish',
        label: 'Любимое угощение на Наурыз',
        kind: 'choice',
        options: ['наурыз-коже', 'баурсаки', 'бешбармак', 'чак-чак'],
        required: false,
      },
      {
        key: 'tradition',
        label: 'Ваша семейная традиция на Наурыз',
        kind: 'text',
        required: false,
        placeholder: 'ходим в гости к бабушке',
      },
    ],
    coverPrompt:
      'two children of different backgrounds laughing on altybakan swings next to a white yurt decorated with Kazakh ornaments, spring festival',
  },
  {
    slug: 'bath-time',
    title: 'Буль-буль, купаемся!',
    summary:
      'Вечерняя ванна для самых маленьких: игрушки, пузыри, повторяющаяся песенка и сладкий сон.',
    ageMin: 2,
    ageMax: 4,
    methodology: 'toddler-routine',
    theme: 'evening bath time',
    plot: [
      'Evening: bath time, the hero runs to the bathroom.',
      'Bath toys join one by one, with a repeating refrain.',
      'Bubbles, splashes and a gentle surprise: a bubble shaped like a heart.',
      'A soft towel, pyjamas and a cozy bed; the refrain says good night.',
    ],
    questions: [
      {
        key: 'toy',
        label: 'Любимая игрушка в ванной',
        kind: 'text',
        required: true,
        placeholder: 'жёлтая уточка',
      },
      {
        key: 'sound',
        label: 'Что малыш говорит, когда плещется?',
        kind: 'choice',
        options: ['буль-буль', 'плюх-плюх', 'кап-кап'],
        required: false,
      },
    ],
    coverPrompt:
      'a toddler in a bubble bath with a yellow rubber duck and floating soap bubbles, warm bathroom light',
  },
];
