import type { UiLocale } from "./messages";

export interface LegalDoc {
  title: string;
  updated: string;
  sections: { title: string; text: string[] }[];
}

const privacyEs: LegalDoc = {
  title: "Política de privacidad",
  updated: "Actualizado el 1 de noviembre de 2026",
  sections: [
    {
      title: "Quiénes somos",
      text: ["Fabulka es un servicio de libros infantiles personalizados con sede en Kazajistán. Para cualquier consulta sobre tus datos, escríbenos a hello@fabulka.com."],
    },
    {
      title: "Qué datos recopilamos",
      text: [
        "Sobre el niño o la niña: nombre, edad, sexo, ciudad, intereses, mascota, respuestas a las preguntas del libro, una foto de un juguete si la subes y una foto del niño o la niña si añades al libro una página con foto. El protagonista se dibuja a partir de una descripción en texto; para eso no hace falta ninguna foto del niño o la niña.",
        "Para la impresión: el nombre del destinatario, su número de teléfono y la dirección de entrega.",
        "Datos técnicos: una clave anónima del navegador (para contar los libros gratuitos), el idioma y el país que elegiste, y el país de tu dirección IP.",
      ],
    },
    {
      title: "Para qué",
      text: ["Para escribir e ilustrar el libro, generar el PDF, imprimirlo y entregarlo, así como para aplicar los límites y proteger el servicio contra abusos."],
    },
    {
      title: "Quién los trata",
      text: [
        "Las respuestas y la foto del juguete se envían a Meta Model API (Muse Spark, Muse Image y SAM 3.1) únicamente para crear el libro. La foto del niño o la niña nunca se envía allí: solo se usa en la página con foto de ese libro y para imprimirlo. Al subirla, borramos del archivo todos los metadatos, incluido el lugar donde se tomó, y la eliminamos cuando quitas la página o el libro. No vendemos los datos ni los usamos con fines publicitarios.",
      ],
    },
    {
      title: "Dónde y durante cuánto tiempo se conservan",
      text: [
        "Los datos se almacenan en servidores ubicados en la República de Kazajistán, tal como exige la ley kazaja de protección de datos personales.",
        "El libro, sus archivos y los pedidos se conservan hasta que nos pidas eliminarlos. Escríbenos a hello@fabulka.com y borraremos todo lo relacionado con el libro.",
        "Los registros técnicos de las solicitudes a los modelos y de los errores se conservan hasta 90 días (el texto de las solicitudes fallidas, hasta 30 días) para poder detectar y corregir problemas.",
      ],
    },
    {
      title: "Dónde no está disponible el servicio",
      text: ["Las normas de Meta no permiten ofrecer el servicio en varios países, entre ellos Rusia y Bielorrusia. Los visitantes de esos países no pueden crear libros."],
    },
    {
      title: "Tus derechos",
      text: [
        "Puedes preguntarnos qué datos tenemos sobre ti, corregirlos o eliminarlos. Solo usamos el almacenamiento del navegador que el sitio necesita (idioma, país, clave anónima) y ningún rastreador publicitario.",
      ],
    },
  ],
};

const termsEs: LegalDoc = {
  title: "Condiciones de uso",
  updated: "Actualizado el 31 de octubre de 2026",
  sections: [
    {
      title: "Qué hace el servicio",
      text: [
        "Fabulka crea libros infantiles personalizados con los modelos de IA de Meta. Cada libro es único, pero los modelos pueden cometer errores: lee el libro antes de mostrárselo a tu hijo o hija o de pedir un ejemplar impreso.",
      ],
    },
    {
      title: "Demo",
      text: ["Por ahora el servicio funciona en modo demo: no se cobra nada, y la impresión y la entrega se muestran a modo de ejemplo."],
    },
    {
      title: "Libros gratuitos y límites",
      text: ["Cada visitante puede crear algunos libros gratis. Para que no se agote el presupuesto de los modelos, el número de libros al día está limitado."],
    },
    {
      title: "Tu libro",
      text: ["El libro creado para tu hijo o hija es tuyo: puedes leerlo, imprimirlo y regalarlo. Las ilustraciones las dibuja Muse Image y el texto lo escribe Muse Spark."],
    },
    {
      title: "Qué no debes hacer",
      text: ["No introduzcas contenido ofensivo o que no sea seguro para niños, ni datos de otros niños sin el consentimiento de sus padres."],
    },
    {
      title: "Disponibilidad",
      text: ["El servicio no está disponible en todos los países (consulta la política de privacidad). Consultas: hello@fabulka.com."],
    },
  ],
};

const privacyDe: LegalDoc = {
  title: "Datenschutzerklärung",
  updated: "Aktualisiert am 1. November 2026",
  sections: [
    {
      title: "Wer wir sind",
      text: ["Fabulka ist ein Dienst für personalisierte Kinderbücher aus Kasachstan. Bei allen Fragen zu deinen Daten schreib an hello@fabulka.com."],
    },
    {
      title: "Welche Daten wir erheben",
      text: [
        "Über das Kind: Name, Alter, Geschlecht, Stadt, Interessen, Haustier, Antworten auf die Fragen zum Buch, ein Foto eines Spielzeugs, falls du eines hochlädst, und ein Foto des Kindes, falls du dem Buch eine Fotoseite hinzufügst. Der Held wird nach einer Textbeschreibung gezeichnet, dafür ist kein Foto des Kindes nötig.",
        "Für den Druck: Name des Empfängers, Telefonnummer und Lieferadresse.",
        "Technische Daten: ein anonymer Browserschlüssel (zum Zählen der kostenlosen Bücher), die von dir gewählte Sprache und das gewählte Land sowie das Land deiner IP-Adresse.",
      ],
    },
    {
      title: "Wozu",
      text: ["Um das Buch zu schreiben und zu illustrieren, das PDF zu erstellen, das Buch zu drucken und zu liefern sowie um Limits einzuhalten und den Dienst vor Missbrauch zu schützen."],
    },
    {
      title: "Wer die Daten verarbeitet",
      text: [
        "Die Antworten und das Foto des Spielzeugs werden ausschließlich zur Erstellung des Buches an die Meta Model API (Muse Spark, Muse Image und SAM 3.1) übermittelt. Das Foto des Kindes wird dorthin nicht übermittelt: Es wird nur auf der Fotoseite dieses Buches und für dessen Druck verwendet. Beim Hochladen entfernen wir alle Metadaten aus der Datei, auch den Aufnahmeort, und wir löschen das Foto, wenn du die Seite oder das Buch entfernst. Wir verkaufen keine Daten und nutzen sie nicht für Werbung.",
      ],
    },
    {
      title: "Wo und wie lange die Daten gespeichert werden",
      text: [
        "Die Daten werden auf Servern in der Republik Kasachstan gespeichert, wie es das kasachische Gesetz über personenbezogene Daten vorschreibt.",
        "Ein Buch, seine Dateien und Bestellungen werden gespeichert, bis du uns bittest, sie zu löschen. Schreib an hello@fabulka.com, und wir löschen alles, was mit dem Buch verbunden ist.",
        "Technische Protokolle von Modellanfragen und Fehlern werden bis zu 90 Tage aufbewahrt (der Text fehlgeschlagener Anfragen bis zu 30 Tage), damit wir Probleme finden und beheben können.",
      ],
    },
    {
      title: "Wo der Dienst nicht verfügbar ist",
      text: ["Die Regeln von Meta erlauben es nicht, den Dienst in einer Reihe von Ländern anzubieten, darunter Russland und Belarus. Besucher aus diesen Ländern können keine Bücher erstellen."],
    },
    {
      title: "Deine Rechte",
      text: [
        "Du kannst erfragen, welche Daten wir über dich gespeichert haben, sie berichtigen oder löschen lassen. Wir nutzen nur den Browserspeicher, den die Website benötigt (Sprache, Land, anonymer Schlüssel), und keine Werbetracker.",
      ],
    },
  ],
};

const termsDe: LegalDoc = {
  title: "Nutzungsbedingungen",
  updated: "Aktualisiert am 31. Oktober 2026",
  sections: [
    {
      title: "Was der Dienst macht",
      text: [
        "Fabulka erstellt personalisierte Kinderbücher mit den KI-Modellen von Meta. Jedes Buch ist einzigartig, doch Modelle können Fehler machen: Bitte lies das Buch, bevor du es deinem Kind zeigst oder einen Druck bestellst.",
      ],
    },
    {
      title: "Demo",
      text: ["Der Dienst läuft derzeit als Demo: Es wird nichts berechnet, und Druck und Lieferung werden nur beispielhaft gezeigt."],
    },
    {
      title: "Kostenlose Bücher und Limits",
      text: ["Jeder Besucher kann einige Bücher kostenlos erstellen. Damit das Modellbudget nicht aufgebraucht wird, ist die Anzahl der Bücher pro Tag begrenzt."],
    },
    {
      title: "Dein Buch",
      text: ["Ein Buch, das für dein Kind erstellt wurde, gehört dir: Lies es, drucke es aus und verschenke es. Die Illustrationen zeichnet Muse Image, den Text schreibt Muse Spark."],
    },
    {
      title: "Was nicht erlaubt ist",
      text: ["Gib keine Inhalte ein, die beleidigend oder für Kinder nicht sicher sind, und keine Angaben zu anderen Kindern ohne die Zustimmung ihrer Eltern."],
    },
    {
      title: "Verfügbarkeit",
      text: ["Der Dienst ist nicht in allen Ländern verfügbar (siehe Datenschutzerklärung). Fragen: hello@fabulka.com."],
    },
  ],
};

/** The privacy policy and terms, written to match what the service actually does. */
export const LEGAL: Record<"privacy" | "terms", Record<UiLocale, LegalDoc>> = {
  privacy: {
    ru: {
      title: "Политика конфиденциальности",
      updated: "Обновлено 1 ноября 2026",
      sections: [
        {
          title: "Кто мы",
          text: [
            "Fabulka — сервис персональных детских книг из Казахстана. По любым вопросам о данных пишите на hello@fabulka.com.",
          ],
        },
        {
          title: "Какие данные мы получаем",
          text: [
            "О ребёнке: имя, возраст, пол, город, увлечения, питомец, ответы на вопросы книги, фотография игрушки, если вы её загрузили, и фотография ребёнка, если вы добавили в книгу страницу с фото. Героя рисует модель по текстовому описанию — фотография ребёнка для этого не нужна.",
            "Для печати: имя получателя, телефон и адрес доставки.",
            "Технические данные: анонимный ключ браузера (по нему считаются бесплатные книги), выбранный язык и страна, а также страна по IP-адресу.",
          ],
        },
        {
          title: "Зачем",
          text: [
            "Чтобы написать и проиллюстрировать книгу, собрать PDF, напечатать и доставить её, а также чтобы соблюдать лимиты и защищать сервис от злоупотреблений.",
          ],
        },
        {
          title: "Кто обрабатывает данные",
          text: [
            "Текст анкеты и фотография игрушки передаются в Meta Model API (модели Muse Spark, Muse Image и SAM 3.1) только для создания книги. Фотографию ребёнка мы туда не передаём: она используется только на странице с фото этой книги и при её печати. При загрузке мы убираем из файла все метаданные, в том числе место съёмки, и удаляем фотографию, когда вы убираете эту страницу или удаляете книгу. Мы не продаём данные и не используем их для рекламы.",
          ],
        },
        {
          title: "Где и сколько хранятся",
          text: [
            "Данные хранятся на серверах в Республике Казахстан в соответствии с законом РК «О персональных данных и их защите».",
            "Книга, её файлы и заказы хранятся, пока вы не попросите их удалить. Напишите на hello@fabulka.com — мы удалим всё, что связано с книгой.",
            "Технические журналы запросов к моделям и ошибок хранятся до 90 дней (тексты запросов, которые завершились ошибкой, — до 30 дней), чтобы находить и исправлять сбои.",
          ],
        },
        {
          title: "Где сервис недоступен",
          text: [
            "Правила Meta не разрешают предлагать сервис в ряде стран, в том числе в России и Беларуси. Посетители из этих стран не могут создавать книги.",
          ],
        },
        {
          title: "Ваши права",
          text: [
            "Вы можете узнать, какие данные о вас хранятся, исправить или удалить их. Мы используем только необходимое хранилище браузера (язык, страна, анонимный ключ) и не подключаем рекламные трекеры.",
          ],
        },
      ],
    },
    kk: {
      title: "Құпиялылық саясаты",
      updated: "2026 жылғы 1 қарашада жаңартылды",
      sections: [
        {
          title: "Біз кімбіз",
          text: ["Fabulka — Қазақстаннан шыққан жеке балалар кітаптарының сервисі. Деректер туралы сұрақтарды hello@fabulka.com мекенжайына жазыңыз."],
        },
        {
          title: "Қандай деректер аламыз",
          text: [
            "Бала туралы: аты, жасы, жынысы, қаласы, қызығушылықтары, үй жануары, кітап сұрақтарына жауаптар, егер жүктесеңіз — ойыншықтың фотосы, ал кітапқа фотосы бар бет қоссаңыз — баланың фотосы. Кейіпкерді модель мәтіндік сипаттама бойынша салады, бұл үшін баланың фотосы керек емес.",
            "Басып шығару үшін: алушының аты, телефоны және жеткізу мекенжайы.",
            "Техникалық деректер: браузердің анонимді кілті (тегін кітаптар соған қарай есептеледі), таңдалған тіл мен ел, сондай-ақ IP мекенжайы бойынша ел.",
          ],
        },
        {
          title: "Не үшін",
          text: ["Кітапты жазу мен суреттеу, PDF құрастыру, оны басып шығару және жеткізу, сондай-ақ шектеулерді сақтау және сервисті теріс пайдаланудан қорғау үшін."],
        },
        {
          title: "Деректерді кім өңдейді",
          text: [
            "Сауалнама мәтіні мен ойыншық фотосы тек кітап жасау үшін Meta Model API-ға (Muse Spark, Muse Image және SAM 3.1 модельдері) жіберіледі. Баланың фотосын оған жібермейміз: ол тек осы кітаптың фото бетінде және кітапты басып шығаруда қолданылады. Жүктеген кезде файлдан барлық метадеректерді, соның ішінде түсірілген орнын өшіреміз, ал осы бетті не кітапты алып тастасаңыз, фотоны жоямыз. Біз деректерді сатпаймыз және жарнамаға пайдаланбаймыз.",
          ],
        },
        {
          title: "Қайда және қанша уақыт сақталады",
          text: [
            "Деректер ҚР «Дербес деректер және оларды қорғау туралы» заңына сәйкес Қазақстан Республикасындағы серверлерде сақталады.",
            "Кітап, оның файлдары мен тапсырыстары сіз жоюды сұрағанша сақталады. hello@fabulka.com мекенжайына жазыңыз — кітапқа қатысты бәрін жоямыз.",
            "Модельдерге сұраулар мен қателердің техникалық журналдары ақауларды табу және түзету үшін 90 күнге дейін сақталады (қатемен аяқталған сұраулардың мәтіндері — 30 күнге дейін).",
          ],
        },
        {
          title: "Сервис қайда қолжетімсіз",
          text: ["Meta ережелері сервисті бірқатар елдерде, соның ішінде Ресей мен Беларусьте ұсынуға рұқсат бермейді. Бұл елдерден келушілер кітап жасай алмайды."],
        },
        {
          title: "Сіздің құқықтарыңыз",
          text: [
            "Сіз өзіңіз туралы қандай деректер сақталатынын біліп, оларды түзете немесе жоя аласыз. Біз тек браузердің қажетті қоймасын (тіл, ел, анонимді кілт) пайдаланамыз және жарнамалық трекерлер қоспаймыз.",
          ],
        },
      ],
    },
    en: {
      title: "Privacy policy",
      updated: "Updated 1 November 2026",
      sections: [
        {
          title: "Who we are",
          text: ["Fabulka is a personalized children's book service from Kazakhstan. For any question about your data, write to hello@fabulka.com."],
        },
        {
          title: "What we collect",
          text: [
            "About the child: name, age, gender, city, interests, pet, answers to the book's questions, a photo of a toy if you upload one, and a photo of the child if you add a photo page to the book. The hero is drawn from a text description; no photo of the child is needed for that.",
            "For printing: the recipient's name, phone number and delivery address.",
            "Technical data: an anonymous browser key (used to count free books), the language and country you chose, and the country of your IP address.",
          ],
        },
        {
          title: "Why",
          text: ["To write and illustrate the book, build the PDF, print and deliver it, and to keep limits and protect the service from abuse."],
        },
        {
          title: "Who processes it",
          text: [
            "The answers and the toy photo are sent to the Meta Model API (Muse Spark, Muse Image and SAM 3.1) only to make the book. The child's photo is never sent there: it is used only on that book's photo page and to print the book. When you upload it, we strip all metadata from the file, including where it was taken, and we delete the photo when you remove the page or the book. We do not sell data or use it for advertising.",
          ],
        },
        {
          title: "Where and how long it is kept",
          text: [
            "Data is stored on servers in the Republic of Kazakhstan, as Kazakhstan's personal data law requires.",
            "A book, its files and orders are kept until you ask us to delete them. Write to hello@fabulka.com and we will delete everything tied to the book.",
            "Technical logs of model requests and errors are kept for up to 90 days (the text of failed requests for up to 30 days) so we can find and fix problems.",
          ],
        },
        {
          title: "Where the service is not available",
          text: ["Meta's rules do not allow offering the service in a number of countries, including Russia and Belarus. Visitors from those countries cannot create books."],
        },
        {
          title: "Your rights",
          text: [
            "You can ask what data we hold about you, correct it or delete it. We only use the browser storage the site needs (language, country, anonymous key) and no advertising trackers.",
          ],
        },
      ],
    },
    es: privacyEs,
    de: privacyDe,
  },
  terms: {
    ru: {
      title: "Условия использования",
      updated: "Обновлено 31 октября 2026",
      sections: [
        {
          title: "Что делает сервис",
          text: [
            "Fabulka создаёт персональные детские книги с помощью моделей искусственного интеллекта Meta. Каждая книга уникальна, но модели могут ошибаться: пожалуйста, прочитайте книгу перед тем, как показать её ребёнку или заказать печать.",
          ],
        },
        {
          title: "Демо-версия",
          text: [
            "Сейчас сервис работает в демо-режиме: оплата не списывается, а печать и доставка показаны для примера.",
          ],
        },
        {
          title: "Бесплатные книги и лимиты",
          text: ["Каждый посетитель может бесплатно создать несколько книг. Чтобы бюджет на модели не закончился, общее число книг в день ограничено."],
        },
        {
          title: "Ваша книга",
          text: [
            "Книга, созданная для вашего ребёнка, — ваша: читайте, печатайте и дарите её. Иллюстрации нарисованы моделью Muse Image, тексты написаны моделью Muse Spark.",
          ],
        },
        {
          title: "Чего делать нельзя",
          text: [
            "Не вводите оскорбительный или опасный для детей контент и данные чужих детей без согласия их родителей.",
          ],
        },
        {
          title: "Доступность",
          text: ["Сервис доступен не во всех странах (см. политику конфиденциальности). Вопросы — hello@fabulka.com."],
        },
      ],
    },
    kk: {
      title: "Пайдалану шарттары",
      updated: "2026 жылғы 31 қазанда жаңартылды",
      sections: [
        {
          title: "Сервис не істейді",
          text: [
            "Fabulka Meta жасанды интеллект модельдерінің көмегімен жеке балалар кітаптарын жасайды. Әр кітап бірегей, бірақ модельдер қателесуі мүмкін: кітапты балаға көрсетпес бұрын немесе басып шығаруға тапсырыс бермес бұрын оқып шығыңыз.",
          ],
        },
        {
          title: "Демо нұсқа",
          text: ["Қазір сервис демо режимде жұмыс істейді: ақша алынбайды, ал басып шығару мен жеткізу мысал ретінде көрсетілген."],
        },
        {
          title: "Тегін кітаптар мен шектеулер",
          text: ["Әр келуші бірнеше кітапты тегін жасай алады. Модельдерге бөлінген бюджет таусылмас үшін күніне жасалатын кітаптар саны шектеулі."],
        },
        {
          title: "Сіздің кітабыңыз",
          text: ["Балаңызға жасалған кітап — сіздікі: оқыңыз, басып шығарыңыз, сыйға тартыңыз. Суреттерді Muse Image моделі салған, мәтінді Muse Spark моделі жазған."],
        },
        {
          title: "Не істеуге болмайды",
          text: ["Қорлайтын немесе балаларға қауіпті мазмұнды, сондай-ақ басқа балалардың деректерін олардың ата-анасының келісімінсіз енгізбеңіз."],
        },
        {
          title: "Қолжетімділік",
          text: ["Сервис барлық елдерде қолжетімді емес (құпиялылық саясатын қараңыз). Сұрақтар — hello@fabulka.com."],
        },
      ],
    },
    en: {
      title: "Terms of use",
      updated: "Updated 31 October 2026",
      sections: [
        {
          title: "What the service does",
          text: [
            "Fabulka creates personalized children's books with Meta's AI models. Every book is unique, but models can make mistakes: please read the book before showing it to your child or ordering a print.",
          ],
        },
        {
          title: "Demo",
          text: ["The service currently runs as a demo: nothing is charged, and printing and delivery are shown as an example."],
        },
        {
          title: "Free books and limits",
          text: ["Every visitor can create a few books for free. To keep the model budget from running out, the number of books per day is capped."],
        },
        {
          title: "Your book",
          text: ["A book made for your child is yours: read it, print it and give it as a gift. The illustrations are drawn by Muse Image and the text is written by Muse Spark."],
        },
        {
          title: "What not to do",
          text: ["Do not enter content that is offensive or unsafe for children, or other children's details without their parents' consent."],
        },
        {
          title: "Availability",
          text: ["The service is not available in every country (see the privacy policy). Questions: hello@fabulka.com."],
        },
      ],
    },
    es: termsEs,
    de: termsDe,
  },
};
