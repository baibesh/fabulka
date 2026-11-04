import type { TemplateTranslation } from '@fabulka/shared';

/**
 * Kazakh, English, Spanish and German text of the starting catalog. Russian is the template
 * itself. Choice options are listed in the same order as the Russian ones.
 */
export const SEED_TRANSLATIONS: Record<
  string,
  Record<'kk' | 'en' | 'es' | 'de', TemplateTranslation>
> = {
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
            'алақан соғыстырамыз',
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
    en: {
      title: 'First Day at Kindergarten',
      summary:
        'Calmly, step by step: saying goodbye, the teacher, games and the moment mum or dad comes back.',
      questions: {
        toy: {
          label: 'Which toy will they take along?',
          placeholder: 'a plush bunny',
        },
        goodbye: {
          label: 'How do you say goodbye in the morning?',
          options: [
            'a hug',
            'waving through the window',
            'a high five',
            'a kiss on the cheek',
          ],
        },
        teacher: {
          label: "What is the teacher's name?",
          placeholder: 'Ms Gulnara',
        },
        looking_forward: {
          label: 'What is your child looking forward to most?',
          options: ['games', 'drawing', 'new friends', 'playing outside'],
        },
      },
    },
    es: {
      title: 'El primer día en la guardería',
      summary:
        'Con calma y paso a paso: la despedida, la maestra, los juegos y el reencuentro con mamá o papá.',
      questions: {
        toy: {
          label: '¿Qué juguete se llevará?',
          placeholder: 'un conejito de peluche',
        },
        goodbye: {
          label: '¿Cómo es la despedida por la mañana?',
          options: [
            'con un abrazo',
            'diciendo adiós por la ventana',
            'chocando los cinco',
            'con un beso en la mejilla',
          ],
        },
        teacher: {
          label: '¿Cómo se llama la maestra o el maestro?',
          placeholder: 'la maestra Lucía',
        },
        looking_forward: {
          label: '¿Qué es lo que más ganas tiene de hacer?',
          options: [
            'jugar',
            'dibujar',
            'hacer nuevos amigos',
            'salir al patio',
          ],
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
          options: ['Spiele', 'Malen', 'neue Freunde', 'draußen spielen'],
        },
      },
    },
  },
  'snow-leopard-alatau': {
    kk: {
      title: 'Ақ барыстың құпиясы',
      summary:
        'Алатау тауларына саяхат: бүркіт, тұман, тау көлі және адасып қалған ақ барыстың күшігі.',
      questions: {
        friend: {
          label: 'Кейіпкермен бірге сапарға шығатын ең жақын досы',
          placeholder: 'Даник',
        },
        dream: {
          label: 'Бала кім болуды армандайды?',
          placeholder: 'құтқарушы',
        },
        color: {
          label: 'Сүйікті түсі',
          options: ['қызыл', 'көк', 'жасыл', 'сары', 'күлгін', 'қызғылт'],
        },
      },
    },
    en: {
      title: 'The Secret of the Snow Leopard',
      summary:
        'A journey to the Alatau mountains: a golden eagle, fog, a mountain lake and a lost snow leopard cub.',
      questions: {
        friend: {
          label: 'A best friend who comes along on the journey',
          placeholder: 'Danik',
        },
        dream: {
          label: 'What does your child dream of becoming?',
          placeholder: 'a rescuer',
        },
        color: {
          label: 'Favourite colour',
          options: ['red', 'blue', 'green', 'yellow', 'purple', 'pink'],
        },
      },
    },
    es: {
      title: 'El secreto del leopardo de las nieves',
      summary:
        'Un viaje a las montañas de Alatau: un águila real, la niebla, un lago de montaña y una cría de leopardo de las nieves perdida.',
      questions: {
        friend: {
          label: 'Su mejor amigo o amiga, que se une a la aventura',
          placeholder: 'Mateo',
        },
        dream: {
          label: '¿Qué sueña con ser cuando crezca?',
          placeholder: 'bombero',
        },
        color: {
          label: 'Color favorito',
          options: ['rojo', 'azul', 'verde', 'amarillo', 'morado', 'rosa'],
        },
      },
    },
    de: {
      title: 'Das Geheimnis des Schneeleoparden',
      summary:
        'Eine Reise ins Alatau-Gebirge: ein Steinadler, Nebel, ein Bergsee und ein verirrtes Schneeleopardenjunges.',
      questions: {
        friend: {
          label:
            'Wer kommt als beste Freundin oder bester Freund mit auf die Reise?',
          placeholder: 'Ben',
        },
        dream: {
          label: 'Was möchte dein Kind später einmal werden?',
          placeholder: 'Bergretterin',
        },
        color: {
          label: 'Lieblingsfarbe',
          options: ['Rot', 'Blau', 'Grün', 'Gelb', 'Lila', 'Rosa'],
        },
      },
    },
  },
  'not-yet': {
    kk: {
      title: 'Мен үйренемін!',
      summary:
        'Әзірге шықпай тұр - тек әзірге. Жаттығу мен жақындардың көмегі «білмеймін» дегенді «білемін» дегенге қалай айналдыратыны туралы кітап.',
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
    en: {
      title: 'I Will Learn!',
      summary:
        'Can\'t do it - yet. A book about how practice and help from loved ones turn "I can\'t" into "I can".',
      questions: {
        skill: {
          label: 'What is your child learning right now?',
          options: [
            'to ride a bike',
            'to swim',
            'to read',
            'to tie shoelaces',
            'to ice-skate',
            'to play the dombra',
          ],
        },
        helper: {
          label: 'Who helps them learn?',
          options: [
            'mum',
            'dad',
            'grandpa',
            'grandma',
            'big brother',
            'big sister',
            'a coach',
          ],
        },
      },
    },
    es: {
      title: '¡Voy a aprender!',
      summary:
        'No me sale… todavía. Un libro sobre cómo la práctica y la ayuda de la familia convierten el «no puedo» en «¡sí puedo!».',
      questions: {
        skill: {
          label: '¿Qué está aprendiendo ahora?',
          options: [
            'a andar en bicicleta',
            'a nadar',
            'a leer',
            'a atarse los cordones',
            'a patinar sobre hielo',
            'a tocar la dombra',
          ],
        },
        helper: {
          label: '¿Quién le ayuda a aprender?',
          options: [
            'mamá',
            'papá',
            'el abuelo',
            'la abuela',
            'su hermano mayor',
            'su hermana mayor',
            'un entrenador',
          ],
        },
      },
    },
    de: {
      title: 'Ich lerne das!',
      summary:
        'Klappt noch nicht? Noch nicht! Ein Buch darüber, wie Üben und die Hilfe der Familie aus „Ich kann das nicht“ ein „Ich kann das!“ machen.',
      questions: {
        skill: {
          label: 'Was lernt dein Kind gerade?',
          options: [
            'Fahrrad fahren',
            'schwimmen',
            'lesen',
            'Schuhe binden',
            'Schlittschuh laufen',
            'Dombra spielen',
          ],
        },
        helper: {
          label: 'Wer hilft beim Lernen?',
          options: [
            'Mama',
            'Papa',
            'Opa',
            'Oma',
            'der große Bruder',
            'die große Schwester',
            'ein Trainer',
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
          options: ['ашу', 'қорқыныш', 'реніш', 'қызғаныш', 'мұң'],
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
    en: {
      title: 'A Storm Inside',
      summary:
        'About big feelings: noticing them, naming them, calming down and making up.',
      questions: {
        feeling: {
          label: 'Which feeling is hardest for your child?',
          options: ['anger', 'fear', 'hurt', 'jealousy', 'sadness'],
        },
        trigger: {
          label: 'What usually sets it off?',
          placeholder: 'when a brother takes their toys',
        },
        calm: {
          label: 'What helps them calm down?',
          options: [
            'hugs',
            'deep breaths',
            'counting to five',
            'a quiet corner',
            'drawing',
          ],
        },
      },
    },
    es: {
      title: 'Una tormenta por dentro',
      summary:
        'Sobre las emociones intensas: cómo notarlas, ponerles nombre, calmarse y hacer las paces.',
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
    de: {
      title: 'Ein Sturm im Bauch',
      summary:
        'Über große Gefühle: sie bemerken, benennen, sich beruhigen und sich wieder vertragen.',
      questions: {
        feeling: {
          label: 'Welches Gefühl fällt deinem Kind am schwersten?',
          options: [
            'Wut',
            'Angst',
            'Gekränktsein',
            'Eifersucht',
            'Traurigkeit',
          ],
        },
        trigger: {
          label: 'Was löst es meistens aus?',
          placeholder: 'wenn der große Bruder die Spielsachen wegnimmt',
        },
        calm: {
          label: 'Was hilft beim Beruhigen?',
          options: [
            'Kuscheln',
            'tief durchatmen',
            'bis fünf zählen',
            'eine ruhige Ecke',
            'Malen',
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
          options: ['наурыз көже', 'бауырсақ', 'бесбармақ', 'шәкшәк'],
        },
        tradition: {
          label: 'Отбасыңыздың Наурыз дәстүрі',
          placeholder: 'әжемізге қонаққа барамыз',
        },
      },
    },
    en: {
      title: 'Nauryz with a New Friend',
      summary:
        'A spring festival at home: nauryz kozhe, a yurt, altybakan swings and a friend who has just moved from another country.',
      questions: {
        friend_country: {
          label: 'Where has the new friend moved from?',
          options: ['Korea', 'Turkey', 'Brazil', 'Germany', 'Japan'],
        },
        dish: {
          label: 'Favourite Nauryz treat',
          options: ['nauryz kozhe', 'baursaks', 'beshbarmak', 'chak-chak'],
        },
        tradition: {
          label: "Your family's Nauryz tradition",
          placeholder: 'we visit grandma',
        },
      },
    },
    es: {
      title: 'Nauryz con un nuevo amigo',
      summary:
        'La fiesta de la primavera en tu ciudad: nauryz kozhe, una yurta, el columpio altybakan y un amigo recién llegado de otro país.',
      questions: {
        friend_country: {
          label: '¿De qué país llegó el nuevo amigo?',
          options: ['Corea', 'Turquía', 'Brasil', 'Alemania', 'Japón'],
        },
        dish: {
          label: 'Su delicia favorita de Nauryz',
          options: ['nauryz kozhe', 'baursak', 'beshbarmak', 'chak-chak'],
        },
        tradition: {
          label: 'La tradición de Nauryz de tu familia',
          placeholder: 'vamos a casa de la abuela',
        },
      },
    },
    de: {
      title: 'Nauryz mit einem neuen Freund',
      summary:
        'Frühlingsfest in der eigenen Stadt: Nauryz-Koshe, eine Jurte, die Altybakan-Schaukel und ein Freund, der gerade aus einem anderen Land hergezogen ist.',
      questions: {
        friend_country: {
          label: 'Aus welchem Land ist der neue Freund hergezogen?',
          options: ['Korea', 'Türkei', 'Brasilien', 'Deutschland', 'Japan'],
        },
        dish: {
          label: 'Lieblingsleckerei zu Nauryz',
          options: ['Nauryz-Koshe', 'Baursak', 'Beschbarmak', 'Tschak-Tschak'],
        },
        tradition: {
          label: 'Eure Nauryz-Tradition in der Familie',
          placeholder: 'wir besuchen Oma',
        },
      },
    },
  },
  'bath-time': {
    kk: {
      title: 'Шалп-шұлп, шомыламыз!',
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
    en: {
      title: 'Splish-Splash, Bath Time!',
      summary:
        'An evening bath for the youngest: toys, bubbles, a repeating little song and sweet dreams.',
      questions: {
        toy: { label: 'Favourite bath toy', placeholder: 'a yellow duck' },
        sound: {
          label: 'What does your little one say when splashing?',
          options: ['splish-splash', 'plop-plop', 'drip-drop'],
        },
      },
    },
    es: {
      title: '¡Chap, chap, a la bañera!',
      summary:
        'Un baño antes de dormir para los más pequeños: juguetes, burbujas, una cancioncita que se repite y dulces sueños.',
      questions: {
        toy: {
          label: 'Su juguete favorito para el baño',
          placeholder: 'un patito amarillo',
        },
        sound: {
          label: '¿Qué dice cuando chapotea?',
          options: ['chap-chap', 'plas-plas', 'plic-ploc'],
        },
      },
    },
    de: {
      title: 'Plitsch-platsch, ab in die Wanne!',
      summary:
        'Das Abendbad für die Kleinsten: Spielzeug, Seifenblasen, ein kleines Lied zum Wiederholen und süße Träume.',
      questions: {
        toy: {
          label: 'Lieblingsspielzeug in der Badewanne',
          placeholder: 'eine gelbe Quietscheente',
        },
        sound: {
          label: 'Was sagt dein Kind beim Planschen?',
          options: ['plitsch-platsch', 'plopp-plopp', 'tropf-tropf'],
        },
      },
    },
  },
};
