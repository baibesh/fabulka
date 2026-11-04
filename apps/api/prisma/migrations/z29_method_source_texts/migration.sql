-- A story method's source as parents read it is now per language, inside "texts" next to the name
-- and summary ({ lang: { name, summary, source } }); the "source" column stays the English one the
-- story prompt names. The seed methods get the seed's sources (DEFAULT_METHODOLOGIES in
-- @fabulka/shared) in the languages they have a text in, only where that text has no source yet,
-- so nothing the admin wrote is replaced and running it again changes nothing. A language a method
-- has no text in gets the whole seed text, source included, from the API on start.
DO $$
DECLARE
  s record;
BEGIN
  FOR s IN
    SELECT * FROM (VALUES
      ('toddler-routine', 'ru', 'Предсказуемые тексты с повторами для раннего чтения; реалистичные истории для малышей'),
      ('toddler-routine', 'kk', 'Ерте сауат ашуға арналған қайталамалы, оңай болжанатын мәтіндер; кішкентайларға арналған өмірдегідей әңгімелер'),
      ('toddler-routine', 'en', 'Predictable and repetitive texts in early literacy; reality-based stories for toddlers'),
      ('toddler-routine', 'es', 'textos predecibles y repetitivos para la lectura temprana y en historias realistas para los más pequeños'),
      ('toddler-routine', 'de', 'Vorhersehbare Texte mit Wiederholungen aus der frühen Leseförderung; realitätsnahe Geschichten für Kleinkinder'),
      ('social-story', 'ru', 'Социальные истории Кэрол Грей'),
      ('social-story', 'kk', 'Кэрол Грейдің «Әлеуметтік әңгімелері»'),
      ('social-story', 'en', 'Social Stories by Carol Gray'),
      ('social-story', 'es', 'las Historias Sociales de Carol Gray'),
      ('social-story', 'de', 'Social Stories nach Carol Gray'),
      ('sel-emotions', 'ru', 'Модель социально-эмоционального обучения CASEL; эмоциональный коучинг Джона Готтмана'),
      ('sel-emotions', 'kk', 'CASEL әлеуметтік-эмоциялық оқыту моделі; Джон Готтманның эмоциялық коучингі'),
      ('sel-emotions', 'en', 'CASEL social and emotional learning framework; emotion coaching by John Gottman'),
      ('sel-emotions', 'es', 'el marco de aprendizaje socioemocional de CASEL y el coaching emocional de John Gottman'),
      ('sel-emotions', 'de', 'CASEL-Modell des sozial-emotionalen Lernens; Emotionscoaching nach John Gottman'),
      ('growth-mindset', 'ru', 'Исследования Кэрол Дуэк о мышлении роста'),
      ('growth-mindset', 'kk', 'Кэрол Двектің даму ойлауы туралы зерттеулері'),
      ('growth-mindset', 'en', 'Growth mindset research by Carol Dweck'),
      ('growth-mindset', 'es', 'las investigaciones de Carol Dweck sobre la mentalidad de crecimiento'),
      ('growth-mindset', 'de', 'Carol Dwecks Forschung zum Wachstumsdenken (Growth Mindset)'),
      ('mirrors-windows', 'ru', '«Зеркала, окна и раздвижные стеклянные двери» Рудин Симс Бишоп'),
      ('mirrors-windows', 'kk', 'Рудин Симс Бишоптың «Айналар, терезелер және сырғымалы шыны есіктер» идеясы'),
      ('mirrors-windows', 'en', '"Mirrors, windows and sliding glass doors" by Rudine Sims Bishop'),
      ('mirrors-windows', 'es', '«Espejos, ventanas y puertas corredizas de cristal», de Rudine Sims Bishop'),
      ('mirrors-windows', 'de', '„Spiegel, Fenster und gläserne Schiebetüren“ von Rudine Sims Bishop'),
      ('adventure-quest', 'ru', 'Путь героя (Кэмпбелл, Воглер), адаптированный для книжек с картинками'),
      ('adventure-quest', 'kk', 'Қаһарман жолы (Кэмпбелл, Воглер), суретті кітапшаларға бейімделген'),
      ('adventure-quest', 'en', 'The hero''s journey (Campbell, Vogler), adapted for picture books'),
      ('adventure-quest', 'es', 'el viaje del héroe (Campbell, Vogler), adaptado a los álbumes ilustrados'),
      ('adventure-quest', 'de', 'Die Heldenreise (Campbell, Vogler), für Bilderbücher angepasst'),
      ('comic-quest', 'ru', 'Путь героя (Кэмпбелл, Воглер) в кадрах комикса; Скотт Макклауд, «Понимание комикса»'),
      ('comic-quest', 'kk', 'Қаһарман жолы (Кэмпбелл, Воглер) комикс кадрларында; Скотт Макклауд, «Комиксті түсіну»'),
      ('comic-quest', 'en', 'The hero''s journey (Campbell, Vogler) told in comic panels; Scott McCloud, Understanding Comics'),
      ('comic-quest', 'es', 'el viaje del héroe (Campbell, Vogler) contado en viñetas y en «Entender el cómic» de Scott McCloud'),
      ('comic-quest', 'de', 'Die Heldenreise (Campbell, Vogler) in Comic-Panels erzählt; Scott McCloud, „Comics richtig lesen“')
    ) AS seed("slug", "lang", "source")
  LOOP
    UPDATE "Methodology"
    SET "texts" = jsonb_set("texts", ARRAY[s."lang", 'source'], to_jsonb(s."source"))
    WHERE "slug" = s."slug"
      AND jsonb_typeof("texts" -> s."lang") = 'object'
      AND coalesce("texts" -> s."lang" ->> 'source', '') = '';
  END LOOP;
END $$;
