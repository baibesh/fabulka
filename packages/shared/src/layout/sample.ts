import type { Language } from "../language";

/**
 * A short sample book in every language: what a theme is tried on before staff publish it, and what
 * the template editor previews a theme in. Page texts are as long as a real page for a 6-year-old,
 * with each language's own letters (ә ғ қ ң ө ұ ү һ і, ñ ¿ ¡, ä ö ü ß) and quotation marks.
 */
export interface SampleBook {
  childName: string;
  title: string;
  pages: string[];
  talkQuestions: string[];
}

export const SAMPLE_BOOKS: Record<Language, SampleBook> = {
  ru: {
    childName: "Алия",
    title: "Алия и ёжик, который потерял звезду",
    pages: [
      "Вечером Алия вышла во двор и услышала тихий шорох. Под яблоней сидел маленький ёжик и грустно смотрел на небо: «Я потерял свою звезду», — прошептал он.",
      "Алия взяла фонарик, и они отправились искать. Звезды не было ни в траве, ни в лужице, ни на крыше старого сарая, где жили воробьи.",
      "У реки им встретилась лягушка. «Звёзды любят воду, — сказала она. — Посмотрите вниз». В тёмной воде что-то ярко мерцало и подмигивало им.",
      "Это было отражение! Звезда всё время была на небе и ждала, когда ёжик поднимет голову. «Спасибо, Алия!» — засмеялся ёжик, и они пошли домой.",
    ],
    talkQuestions: ["Почему ёжик грустил?", "Где друзья искали звезду?", "А ты когда-нибудь что-то находил?"],
  },
  kk: {
    childName: "Әлия",
    title: "Әлия және жұлдызын жоғалтқан кірпі",
    pages: [
      "Кешке Әлия ауланы аралап жүріп, ақырын сыбдырды естіді. Алма ағашының түбінде кішкентай кірпі отыр екен. Ол аспанға мұңая қарап: «Жұлдызымды жоғалтып алдым», — деп сыбырлады.",
      "Әлия шамын алды да, екеуі іздеуге шықты. Жұлдыз шөптің арасында да, шалшықта да, торғайлар тұратын ескі қораның шатырында да жоқ болып шықты.",
      "Өзен жағасында оларға бақа кездесті. «Жұлдыздар суды жақсы көреді, — деді ол. — Төмен қараңдар». Қара суда бір нәрсе жарқырап, оларға көз қысып тұрды.",
      "Бұл жұлдыздың суреті еді! Жұлдыз үнемі аспанда болып, кірпінің басын көтеруін күтіпті. «Рақмет, Әлия!» — деп күлді кірпі, сөйтіп олар үйге қайтты.",
    ],
    talkQuestions: ["Кірпі неге мұңайды?", "Достар жұлдызды қайдан іздеді?", "Сен бір нәрсе тауып көрдің бе?"],
  },
  en: {
    childName: "Alia",
    title: "Alia and the Hedgehog Who Lost His Star",
    pages: [
      "One evening Alia stepped into the garden and heard a quiet rustle. Under the apple tree sat a tiny hedgehog, looking sadly at the sky. “I’ve lost my star,” he whispered.",
      "Alia fetched her torch, and off they went to look. The star wasn’t in the grass, or in the puddle, or on the roof of the old shed where the sparrows lived.",
      "By the river they met a frog. “Stars love water,” she said. “Look down.” Something in the dark water twinkled brightly and winked at them.",
      "It was a reflection! The star had been in the sky all along, waiting for the hedgehog to look up. “Thank you, Alia!” laughed the hedgehog, and they walked home.",
    ],
    talkQuestions: ["Why was the hedgehog sad?", "Where did the friends look for the star?", "Have you ever found something you lost?"],
  },
  es: {
    childName: "Alía",
    title: "Alía y el erizo que perdió su estrella",
    pages: [
      "Una tarde, Alía salió al jardín y oyó un susurro. Bajo el manzano había un erizo pequeñito que miraba el cielo con tristeza. «He perdido mi estrella», susurró.",
      "Alía cogió su linterna y se fueron a buscarla. La estrella no estaba en la hierba, ni en el charco, ni en el tejado del viejo cobertizo donde vivían los gorriones.",
      "Junto al río se encontraron con una rana. «¿Sabéis? A las estrellas les encanta el agua —dijo—. ¡Mirad hacia abajo!». Algo brillaba en el agua oscura y les guiñaba un ojo.",
      "¡Era su reflejo! La estrella había estado siempre en el cielo, esperando a que el erizo levantara la cabeza. «¡Gracias, Alía!», rio el erizo, y volvieron a casa.",
    ],
    talkQuestions: ["¿Por qué estaba triste el erizo?", "¿Dónde buscaron la estrella?", "¿Alguna vez encontraste algo que habías perdido?"],
  },
  de: {
    childName: "Alia",
    title: "Alia und der Igel, der seinen Stern verlor",
    pages: [
      "Eines Abends ging Alia in den Garten und hörte ein leises Rascheln. Unter dem Apfelbaum saß ein kleiner Igel und schaute traurig zum Himmel. „Ich habe meinen Stern verloren“, flüsterte er.",
      "Alia holte ihre Taschenlampe, und die beiden machten sich auf die Suche. Der Stern war weder im Gras noch in der Pfütze noch auf dem Dach des alten Schuppens, wo die Spatzen wohnten.",
      "Am Fluss trafen sie einen Frosch. „Sterne lieben das Wasser“, sagte er. „Schaut nach unten.“ Im dunklen Wasser funkelte etwas ganz hell und zwinkerte ihnen zu.",
      "Es war ein Spiegelbild! Der Stern war die ganze Zeit am Himmel gewesen und hatte gewartet, dass der Igel aufschaut. „Danke, Alia!“, lachte der Igel, und sie gingen fröhlich nach Hause.",
    ],
    talkQuestions: ["Warum war der Igel traurig?", "Wo suchten die Freunde den Stern?", "Hast du schon einmal etwas wiedergefunden?"],
  },
};
