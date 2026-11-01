/**
 * Frozen copies of reference data the API once seeded, exactly as stored. On start a stored value
 * still equal to one of these was never edited by the owner, so it is replaced by today's default
 * (see ReferenceService.upgrade). Never edit these: add a new copy when a default changes again.
 */

/** reference.countries as seeded until November 2026: Russian first nearly everywhere. */
export const SEEDED_COUNTRIES_V1: unknown = [
  { code: 'KZ', languages: ['kk', 'ru', 'en'], currency: 'KZT', print: true },
  { code: 'UZ', languages: ['ru', 'en'], currency: 'USD', print: false },
  { code: 'KG', languages: ['ru', 'en'], currency: 'USD', print: false },
  { code: 'TJ', languages: ['ru', 'en'], currency: 'USD', print: false },
  { code: 'TM', languages: ['ru', 'en'], currency: 'USD', print: false },
  { code: 'AZ', languages: ['ru', 'en'], currency: 'USD', print: false },
  { code: 'AM', languages: ['ru', 'en'], currency: 'USD', print: false },
  { code: 'GE', languages: ['ru', 'en'], currency: 'USD', print: false },
  { code: 'MD', languages: ['ru', 'en'], currency: 'USD', print: false },
  { code: 'MN', languages: ['ru', 'en'], currency: 'USD', print: false },
  { code: 'TR', languages: ['en', 'ru'], currency: 'USD', print: false },
  { code: 'AE', languages: ['en', 'ru'], currency: 'USD', print: false },
  { code: 'IL', languages: ['ru', 'en'], currency: 'USD', print: false },
  { code: 'DE', languages: ['en', 'ru'], currency: 'USD', print: false },
  { code: 'PL', languages: ['en', 'ru'], currency: 'USD', print: false },
  { code: 'CZ', languages: ['en', 'ru'], currency: 'USD', print: false },
  { code: 'GB', languages: ['en', 'ru'], currency: 'USD', print: false },
  { code: 'US', languages: ['en', 'ru'], currency: 'USD', print: false },
  { code: 'CA', languages: ['en', 'ru'], currency: 'USD', print: false },
];

/** reference.faq as seeded until November 2026: print told apart by Kazakhstan, not by print. */
export const SEEDED_FAQ_V1: unknown = [
  {
    id: 'time',
    countries: [],
    excludeCountries: false,
    published: true,
    q: {
      ru: 'Сколько ждать книгу?',
      kk: 'Кітапты қанша күту керек?',
      en: 'How long does it take?',
    },
    a: {
      ru: 'Обычно около трёх минут: сначала пишется сказка, потом рисуются герой и страницы. Прогресс видно на странице книги, а готовую можно сразу листать и скачать в PDF.',
      kk: 'Әдетте үш минуттай: алдымен ертегі жазылады, содан кейін кейіпкер мен беттер салынады. Барысы кітап бетінде көрінеді, дайын кітапты бірден парақтап, PDF түрінде жүктеуге болады.',
      en: "Usually about three minutes: first the story is written, then the hero and the pages are drawn. You can watch the progress on the book's page, then read the finished book or download the PDF right away.",
    },
  },
  {
    id: 'kazakh',
    countries: ['KZ'],
    excludeCountries: false,
    published: true,
    q: {
      ru: 'Можно ли сделать книгу на казахском?',
      kk: 'Кітапты қазақ тілінде жасауға бола ма?',
      en: 'Can I make a book in Kazakh?',
    },
    a: {
      ru: 'Да. Язык книги выбирается в форме: қазақша, русский или English. Сказка пишется сразу на этом языке, а не переводится.',
      kk: 'Иә. Кітап тілі формада таңдалады: қазақша, русский немесе English. Ертегі аударылмайды, бірден сол тілде жазылады.',
      en: "Yes. You choose the book's language in the form: қазақша, русский or English. The story is written in that language, not translated.",
    },
  },
  {
    id: 'languages',
    countries: ['KZ'],
    excludeCountries: true,
    published: true,
    q: {
      ru: 'На каких языках можно сделать книгу?',
      kk: 'Кітапты қай тілдерде жасауға болады?',
      en: 'Which languages can a book be in?',
    },
    a: {
      ru: 'Язык книги выбирается в форме: {languages}. Сказка пишется сразу на этом языке, а не переводится.',
      kk: 'Кітап тілі формада таңдалады: {languages}. Ертегі аударылмайды, бірден сол тілде жазылады.',
      en: "You choose the book's language in the form: {languages}. The story is written in that language, not translated.",
    },
  },
  {
    id: 'price-kz',
    countries: ['KZ'],
    excludeCountries: false,
    published: true,
    q: {
      ru: 'Сколько стоит книга?',
      kk: 'Кітап қанша тұрады?',
      en: 'How much does a book cost?',
    },
    a: {
      ru: 'Первые книги — бесплатно. Дальше книга из каталога стоит {templatePrice}, своя история — {customPrice}. Цены в тенге; печатная книга оплачивается отдельно.',
      kk: 'Алғашқы кітаптар — тегін. Одан кейін каталогтағы кітап — {templatePrice}, өз ертегің — {customPrice}. Бағалар теңгемен; басылған кітап бөлек төленеді.',
      en: 'Your first books are free. After that a catalog book is {templatePrice} and a story of your own {customPrice}. Prices are in tenge; a printed copy is paid for separately.',
    },
  },
  {
    id: 'price-abroad',
    countries: ['KZ'],
    excludeCountries: true,
    published: true,
    q: {
      ru: 'Сколько стоит книга?',
      kk: 'Кітап қанша тұрады?',
      en: 'How much does a book cost?',
    },
    a: {
      ru: 'Первые книги — бесплатно. Дальше книга из каталога стоит {templatePrice}, своя история — {customPrice}. Для вашей страны цены указаны в долларах.',
      kk: 'Алғашқы кітаптар — тегін. Одан кейін каталогтағы кітап — {templatePrice}, өз ертегің — {customPrice}. Сіздің еліңіз үшін бағалар долларда көрсетілген.',
      en: 'Your first books are free. After that a catalog book is {templatePrice} and a story of your own {customPrice}. For your country prices are in US dollars.',
    },
  },
  {
    id: 'data',
    countries: [],
    excludeCountries: false,
    published: true,
    q: {
      ru: 'Что происходит с данными ребёнка?',
      kk: 'Баланың деректері не болады?',
      en: "What happens to my child's data?",
    },
    a: {
      ru: 'Данные хранятся на серверах в Казахстане. Мы не просим фотографий детей: героя рисуют по описанию, а фото нужно только для игрушки, если захотите. Всё удалим по запросу на hello@fabulka.com.',
      kk: 'Деректер Қазақстандағы серверлерде сақталады. Біз балалардың фотосын сұрамаймыз: кейіпкер сипаттама бойынша салынады, ал фото тек ойыншық үшін, қаласаңыз ғана керек. Сұрауыңыз бойынша бәрін өшіреміз: hello@fabulka.com.',
      en: 'It is stored on servers in Kazakhstan. We never ask for photos of children: the hero is drawn from a description, and a photo is only needed for the toy, if you want one. We delete everything on request at hello@fabulka.com.',
    },
  },
  {
    id: 'print-kz',
    countries: ['KZ'],
    excludeCountries: false,
    published: true,
    q: {
      ru: 'Как заказать печатную книгу?',
      kk: 'Басылған кітапқа қалай тапсырыс беремін?',
      en: 'How do I get a printed book?',
    },
    a: {
      ru: 'На странице готовой книги нажмите «Заказать печатную книгу». Мягкая обложка — {softCover}, твёрдая — {hardCover}. Бесплатная доставка: {freeCities}; в другие города Казахстана — {delivery}.',
      kk: 'Дайын кітаптың бетінде «Басылған кітапқа тапсырыс» батырмасын басыңыз. Жұмсақ мұқаба — {softCover}, қатты мұқаба — {hardCover}. Тегін жеткізу: {freeCities}; Қазақстанның басқа қалаларына — {delivery}.',
      en: "On the finished book's page, press “Order a printed book”. A soft cover is {softCover}, a hard cover {hardCover}. Free delivery to {freeCities}; to other cities in Kazakhstan, {delivery}.",
    },
  },
  {
    id: 'print-abroad',
    countries: ['KZ'],
    excludeCountries: true,
    published: true,
    q: {
      ru: 'Можно ли заказать печатную книгу?',
      kk: 'Басылған кітапқа тапсырыс беруге бола ма?',
      en: 'Can I get a printed book?',
    },
    a: {
      ru: 'К сожалению, в вашей стране печатные книги пока недоступны, но мы планируем открыть печать и в других странах. А пока готовую книгу можно скачать в PDF и распечатать самим. Нажмите «Хочу печатную книгу» на странице книги — и мы сообщим, когда печать заработает у вас.',
      kk: 'Өкінішке қарай, сіздің еліңізде басылған кітаптар әзірге қолжетімсіз, бірақ біз басып шығаруды басқа елдерде де ашуды жоспарлап отырмыз. Әзірге дайын кітапты PDF түрінде жүктеп, өзіңіз басып шығара аласыз. Кітап бетінде «Басылған кітап керек» батырмасын басыңыз — басып шығару сіздің елде іске қосылғанда хабарлаймыз.',
      en: "Unfortunately, printed books aren't available in your country yet, but we plan to bring printing to more countries. Meanwhile you can download the finished book as a PDF and print it yourself. Press “I want a printed book” on the book's page and we'll let you know when printing reaches you.",
    },
  },
  {
    id: 'account',
    countries: [],
    excludeCountries: false,
    published: true,
    q: {
      ru: 'Нужно ли регистрироваться?',
      kk: 'Тіркелу керек пе?',
      en: 'Do I need to sign up?',
    },
    a: {
      ru: 'Нет. Книги сохраняются в вашем браузере, в разделе «Мои книги». Достаточно открыть каталог и выбрать историю.',
      kk: 'Жоқ. Кітаптар браузеріңізде, «Менің кітаптарым» бөлімінде сақталады. Каталогты ашып, ертегі таңдасаңыз жеткілікті.',
      en: 'No. Your books are kept in your browser under “My books”. Just open the catalog and choose a story.',
    },
  },
  {
    id: 'dislike',
    countries: [],
    excludeCountries: false,
    published: true,
    q: {
      ru: 'А если книга не понравится?',
      kk: 'Кітап ұнамаса ше?',
      en: "What if I don't like the book?",
    },
    a: {
      ru: 'Сделайте новую: поменяйте ответы, тему или методику. Если что-то пошло не так, напишите нам на hello@fabulka.com — разберёмся.',
      kk: 'Жаңасын жасаңыз: жауаптарды, тақырыпты не әдістемені өзгертіңіз. Бірдеңе дұрыс болмаса, hello@fabulka.com поштасына жазыңыз — көмектесеміз.',
      en: "Make another one: change the answers, the topic or the method. If something went wrong, write to hello@fabulka.com and we'll sort it out.",
    },
  },
];

/**
 * reference.countries as seeded until the Spanish and German interface (November 2026): Russian
 * first only where many families read it, English in Germany.
 */
export const SEEDED_COUNTRIES_V2: unknown = [
  { code: 'KZ', languages: ['kk', 'ru', 'en'], currency: 'KZT', print: true },
  { code: 'UZ', languages: ['ru', 'en'], currency: 'USD', print: false },
  { code: 'KG', languages: ['ru', 'en'], currency: 'USD', print: false },
  { code: 'TJ', languages: ['ru', 'en'], currency: 'USD', print: false },
  { code: 'TM', languages: ['ru', 'en'], currency: 'USD', print: false },
  { code: 'AZ', languages: ['ru', 'en'], currency: 'USD', print: false },
  { code: 'AM', languages: ['ru', 'en'], currency: 'USD', print: false },
  { code: 'GE', languages: ['en', 'ru'], currency: 'USD', print: false },
  { code: 'MD', languages: ['en', 'ru'], currency: 'USD', print: false },
  { code: 'IL', languages: ['en', 'ru'], currency: 'USD', print: false },
  { code: 'MN', languages: ['en'], currency: 'USD', print: false },
  { code: 'TR', languages: ['en'], currency: 'USD', print: false },
  { code: 'AE', languages: ['en'], currency: 'USD', print: false },
  { code: 'DE', languages: ['en'], currency: 'USD', print: false },
  { code: 'PL', languages: ['en'], currency: 'USD', print: false },
  { code: 'CZ', languages: ['en'], currency: 'USD', print: false },
  { code: 'GB', languages: ['en'], currency: 'USD', print: false },
  { code: 'US', languages: ['en'], currency: 'USD', print: false },
  { code: 'CA', languages: ['en'], currency: 'USD', print: false },
];

/** reference.faq as seeded until the Spanish and German interface: no Spanish or German texts. */
export const SEEDED_FAQ_V2: unknown = [
  {
    id: 'time',
    countries: [],
    excludeCountries: false,
    published: true,
    q: {
      ru: 'Сколько ждать книгу?',
      kk: 'Кітапты қанша күту керек?',
      en: 'How long does it take?',
    },
    a: {
      ru: 'Обычно около трёх минут: сначала пишется сказка, потом рисуются герой и страницы. Прогресс видно на странице книги, а готовую можно сразу листать и скачать в PDF.',
      kk: 'Әдетте үш минуттай: алдымен ертегі жазылады, содан кейін кейіпкер мен беттер салынады. Барысы кітап бетінде көрінеді, дайын кітапты бірден парақтап, PDF түрінде жүктеуге болады.',
      en: "Usually about three minutes: first the story is written, then the hero and the pages are drawn. You can watch the progress on the book's page, then read the finished book or download the PDF right away.",
    },
  },
  {
    id: 'kazakh',
    countries: ['KZ'],
    excludeCountries: false,
    published: true,
    q: {
      ru: 'Можно ли сделать книгу на казахском?',
      kk: 'Кітапты қазақ тілінде жасауға бола ма?',
      en: 'Can I make a book in Kazakh?',
    },
    a: {
      ru: 'Да. Язык книги выбирается в форме: қазақша, русский или English. Сказка пишется сразу на этом языке, а не переводится.',
      kk: 'Иә. Кітап тілі формада таңдалады: қазақша, русский немесе English. Ертегі аударылмайды, бірден сол тілде жазылады.',
      en: "Yes. You choose the book's language in the form: қазақша, русский or English. The story is written in that language, not translated.",
    },
  },
  {
    id: 'languages',
    countries: ['KZ'],
    excludeCountries: true,
    published: true,
    q: {
      ru: 'На каких языках можно сделать книгу?',
      kk: 'Кітапты қай тілдерде жасауға болады?',
      en: 'Which languages can a book be in?',
    },
    a: {
      ru: 'Язык книги выбирается в форме: {languages}. Сказка пишется сразу на этом языке, а не переводится.',
      kk: 'Кітап тілі формада таңдалады: {languages}. Ертегі аударылмайды, бірден сол тілде жазылады.',
      en: "You choose the book's language in the form: {languages}. The story is written in that language, not translated.",
    },
  },
  {
    id: 'price-kz',
    countries: ['KZ'],
    excludeCountries: false,
    published: true,
    q: {
      ru: 'Сколько стоит книга?',
      kk: 'Кітап қанша тұрады?',
      en: 'How much does a book cost?',
    },
    a: {
      ru: 'Первые книги — бесплатно. Дальше книга из каталога стоит {templatePrice}, своя история — {customPrice}. Цены в тенге; печатная книга оплачивается отдельно.',
      kk: 'Алғашқы кітаптар — тегін. Одан кейін каталогтағы кітап — {templatePrice}, өз ертегің — {customPrice}. Бағалар теңгемен; басылған кітап бөлек төленеді.',
      en: 'Your first books are free. After that a catalog book is {templatePrice} and a story of your own {customPrice}. Prices are in tenge; a printed copy is paid for separately.',
    },
  },
  {
    id: 'price-abroad',
    countries: ['KZ'],
    excludeCountries: true,
    published: true,
    q: {
      ru: 'Сколько стоит книга?',
      kk: 'Кітап қанша тұрады?',
      en: 'How much does a book cost?',
    },
    a: {
      ru: 'Первые книги — бесплатно. Дальше книга из каталога стоит {templatePrice}, своя история — {customPrice}. Для вашей страны цены указаны в долларах.',
      kk: 'Алғашқы кітаптар — тегін. Одан кейін каталогтағы кітап — {templatePrice}, өз ертегің — {customPrice}. Сіздің еліңіз үшін бағалар долларда көрсетілген.',
      en: 'Your first books are free. After that a catalog book is {templatePrice} and a story of your own {customPrice}. For your country prices are in US dollars.',
    },
  },
  {
    id: 'data',
    countries: [],
    excludeCountries: false,
    published: true,
    q: {
      ru: 'Что происходит с данными ребёнка?',
      kk: 'Баланың деректері не болады?',
      en: "What happens to my child's data?",
    },
    a: {
      ru: 'Данные хранятся на серверах в Казахстане. Мы не просим фотографий детей: героя рисуют по описанию, а фото нужно только для игрушки, если захотите. Всё удалим по запросу на hello@fabulka.com.',
      kk: 'Деректер Қазақстандағы серверлерде сақталады. Біз балалардың фотосын сұрамаймыз: кейіпкер сипаттама бойынша салынады, ал фото тек ойыншық үшін, қаласаңыз ғана керек. Сұрауыңыз бойынша бәрін өшіреміз: hello@fabulka.com.',
      en: 'It is stored on servers in Kazakhstan. We never ask for photos of children: the hero is drawn from a description, and a photo is only needed for the toy, if you want one. We delete everything on request at hello@fabulka.com.',
    },
  },
  {
    id: 'print-kz',
    countries: [],
    excludeCountries: false,
    print: 'with',
    published: true,
    q: {
      ru: 'Как заказать печатную книгу?',
      kk: 'Басылған кітапқа қалай тапсырыс беремін?',
      en: 'How do I get a printed book?',
    },
    a: {
      ru: 'На странице готовой книги нажмите «Заказать печатную книгу». Мягкая обложка — {softCover}, твёрдая — {hardCover}. Бесплатная доставка: {freeCities}; в другие города — {delivery}.',
      kk: 'Дайын кітаптың бетінде «Басылған кітапқа тапсырыс» батырмасын басыңыз. Жұмсақ мұқаба — {softCover}, қатты мұқаба — {hardCover}. Тегін жеткізу: {freeCities}; басқа қалаларға — {delivery}.',
      en: "On the finished book's page, press “Order a printed book”. A soft cover is {softCover}, a hard cover {hardCover}. Free delivery to {freeCities}; to other cities, {delivery}.",
    },
  },
  {
    id: 'print-abroad',
    countries: [],
    excludeCountries: false,
    print: 'without',
    published: true,
    q: {
      ru: 'Можно ли заказать печатную книгу?',
      kk: 'Басылған кітапқа тапсырыс беруге бола ма?',
      en: 'Can I get a printed book?',
    },
    a: {
      ru: 'К сожалению, в вашей стране печатные книги пока недоступны, но мы планируем открыть печать и в других странах. А пока готовую книгу можно скачать в PDF и распечатать самим. Нажмите «Хочу печатную книгу» на странице книги — и мы сообщим, когда печать заработает у вас.',
      kk: 'Өкінішке қарай, сіздің еліңізде басылған кітаптар әзірге қолжетімсіз, бірақ біз басып шығаруды басқа елдерде де ашуды жоспарлап отырмыз. Әзірге дайын кітапты PDF түрінде жүктеп, өзіңіз басып шығара аласыз. Кітап бетінде «Басылған кітап керек» батырмасын басыңыз — басып шығару сіздің елде іске қосылғанда хабарлаймыз.',
      en: "Unfortunately, printed books aren't available in your country yet, but we plan to bring printing to more countries. Meanwhile you can download the finished book as a PDF and print it yourself. Press “I want a printed book” on the book's page and we'll let you know when printing reaches you.",
    },
  },
  {
    id: 'account',
    countries: [],
    excludeCountries: false,
    published: true,
    q: {
      ru: 'Нужно ли регистрироваться?',
      kk: 'Тіркелу керек пе?',
      en: 'Do I need to sign up?',
    },
    a: {
      ru: 'Нет. Книги сохраняются в вашем браузере, в разделе «Мои книги». Достаточно открыть каталог и выбрать историю.',
      kk: 'Жоқ. Кітаптар браузеріңізде, «Менің кітаптарым» бөлімінде сақталады. Каталогты ашып, ертегі таңдасаңыз жеткілікті.',
      en: 'No. Your books are kept in your browser under “My books”. Just open the catalog and choose a story.',
    },
  },
  {
    id: 'dislike',
    countries: [],
    excludeCountries: false,
    published: true,
    q: {
      ru: 'А если книга не понравится?',
      kk: 'Кітап ұнамаса ше?',
      en: "What if I don't like the book?",
    },
    a: {
      ru: 'Сделайте новую: поменяйте ответы, тему или методику. Если что-то пошло не так, напишите нам на hello@fabulka.com — разберёмся.',
      kk: 'Жаңасын жасаңыз: жауаптарды, тақырыпты не әдістемені өзгертіңіз. Бірдеңе дұрыс болмаса, hello@fabulka.com поштасына жазыңыз — көмектесеміз.',
      en: "Make another one: change the answers, the topic or the method. If something went wrong, write to hello@fabulka.com and we'll sort it out.",
    },
  },
];
