import type { UiLocale } from "./messages";

export interface LegalDoc {
  title: string;
  updated: string;
  sections: { title: string; text: string[] }[];
}

/** The privacy policy and terms, written to match what the service actually does. */
export const LEGAL: Record<"privacy" | "terms", Record<UiLocale, LegalDoc>> = {
  privacy: {
    ru: {
      title: "Политика конфиденциальности",
      updated: "Обновлено 31 октября 2026",
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
            "О ребёнке: имя, возраст, пол, город, увлечения, питомец, ответы на вопросы книги и, если вы её загрузили, фотография игрушки. Фотографию ребёнка мы не просим: героя рисует модель по текстовому описанию.",
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
            "Текст анкеты и фотография игрушки передаются в Meta Model API (модели Muse Spark, Muse Image и SAM 3.1) только для создания книги. Мы не продаём данные и не используем их для рекламы.",
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
      updated: "2026 жылғы 31 қазанда жаңартылды",
      sections: [
        {
          title: "Біз кімбіз",
          text: ["Fabulka — Қазақстаннан шыққан жеке балалар кітаптарының сервисі. Деректер туралы сұрақтарды hello@fabulka.com поштасына жазыңыз."],
        },
        {
          title: "Қандай деректер аламыз",
          text: [
            "Бала туралы: аты, жасы, жынысы, қаласы, қызығушылықтары, үй жануары, кітап сұрақтарына жауаптар және, егер жүктесеңіз, ойыншықтың фотосы. Баланың фотосын сұрамаймыз: кейіпкерді модель мәтіндік сипаттама бойынша салады.",
            "Басып шығару үшін: алушының аты, телефоны және жеткізу мекенжайы.",
            "Техникалық деректер: браузердің анонимді кілті (тегін кітаптар соған қарай есептеледі), таңдалған тіл мен ел, сондай-ақ IP мекенжайы бойынша ел.",
          ],
        },
        {
          title: "Не үшін",
          text: ["Кітапты жазып, суреттеу, PDF жинау, басып шығарып жеткізу, сондай-ақ шектеулерді сақтау және сервисті теріс пайдаланудан қорғау үшін."],
        },
        {
          title: "Деректерді кім өңдейді",
          text: [
            "Сауалнама мәтіні мен ойыншық фотосы тек кітап жасау үшін Meta Model API-ға (Muse Spark, Muse Image және SAM 3.1 модельдері) жіберіледі. Біз деректерді сатпаймыз және жарнамаға пайдаланбаймыз.",
          ],
        },
        {
          title: "Қайда және қанша уақыт сақталады",
          text: [
            "Деректер ҚР «Дербес деректер және оларды қорғау туралы» заңына сәйкес Қазақстан Республикасындағы серверлерде сақталады.",
            "Кітап, оның файлдары мен тапсырыстары сіз жоюды сұрағанша сақталады. hello@fabulka.com поштасына жазыңыз — кітапқа қатысты бәрін жоямыз.",
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
            "Сіз туралы қандай деректер сақталатынын біліп, оларды түзетуге немесе жоюға болады. Біз тек браузердің қажетті қоймасын (тіл, ел, анонимді кілт) пайдаланамыз және жарнамалық трекерлер қоспаймыз.",
          ],
        },
      ],
    },
    en: {
      title: "Privacy policy",
      updated: "Updated 31 October 2026",
      sections: [
        {
          title: "Who we are",
          text: ["Fabulka is a personalized children's book service from Kazakhstan. For any question about your data, write to hello@fabulka.com."],
        },
        {
          title: "What we collect",
          text: [
            "About the child: name, age, gender, city, interests, pet, answers to the book's questions and, if you upload one, a photo of a toy. We never ask for a photo of the child: the hero is drawn from a text description.",
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
            "The answers and the toy photo are sent to the Meta Model API (Muse Spark, Muse Image and SAM 3.1) only to make the book. We do not sell data or use it for advertising.",
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
          text: ["Балаларға қорлайтын немесе қауіпті мазмұнды және ата-анасының келісімінсіз басқа балалардың деректерін енгізбеңіз."],
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
  },
};
