import { describe, expect, it } from "vitest";
import { keyWords, markPersonal, stem, type Piece } from "./personalization";

const SAMPLE = [
  { value: "Алия", hint: "name" },
  { value: "Алматы", hint: "city" },
  { value: "Бусинка", hint: "toy" },
  { value: "рыжий кот Барсик", hint: "pet" },
  { value: "глубоко подышать", hint: "calm" },
];

/** The marked words of a text with their hints. */
const marks = (pieces: Piece[]) => pieces.flatMap((p) => (typeof p === "string" ? [] : [`${p.text}:${p.hint}`]));

describe("stem", () => {
  it("drops an inflecting ending but keeps at least three letters", () => {
    expect(stem("Алия")).toBe("али");
    expect(stem("Бусинка")).toBe("бусинк");
    expect(stem("Барсик")).toBe("барсик");
    expect(stem("зелёный")).toBe("зелен");
    expect(stem("Ян")).toBe("ян");
    expect(stem("Оля")).toBe("оля");
  });
});

describe("keyWords", () => {
  it("prefers a name inside a phrase", () => {
    expect(keyWords("рыжий кот Барсик")).toEqual(["Барсик"]);
    expect(keyWords("подружка Айша")).toEqual(["Айша"]);
  });

  it("otherwise takes the longer words, skipping common ones", () => {
    expect(keyWords("глубоко подышать")).toEqual(["глубоко", "подышать"]);
    expect(keyWords("Когда брат берёт игрушки")).toEqual(["брат", "берёт", "игрушки"]);
    expect(keyWords("Гульнара апай")).toEqual(["Гульнара", "апай"]);
    expect(keyWords("кот")).toEqual(["кот"]);
    expect(keyWords("")).toEqual([]);
  });
});

describe("markPersonal", () => {
  it("finds inflected forms of names, the city, the toy and the pet", () => {
    const pieces = markPersonal("Алии подарили Бусинку, а Барсика оставили в Алматы с Алией.", SAMPLE);
    expect(marks(pieces)).toEqual(["Алии:name", "Бусинку:toy", "Барсика:pet", "Алматы:city", "Алией:name"]);
  });

  it("keeps the text intact around the marks", () => {
    const text = "Страница 1. Алия отправляется в новое приключение в городе Алматы.";
    const pieces = markPersonal(text, SAMPLE);
    expect(pieces.map((p) => (typeof p === "string" ? p : p.text)).join("")).toBe(text);
    expect(pieces[0]).toBe("Страница 1. ");
    expect(pieces.at(-1)).toBe(".");
  });

  it("is case-insensitive and treats ё as е", () => {
    expect(marks(markPersonal("АЛИЯ любит зеленый цвет", [...SAMPLE, { value: "зелёный", hint: "color" }]))).toEqual([
      "АЛИЯ:name",
      "зеленый:color",
    ]);
  });

  it("joins neighbouring words of one answer and leaves unrelated words alone", () => {
    expect(marks(markPersonal("Нужно глубоко подышать, глубоко-глубоко.", SAMPLE))).toEqual([
      "глубоко подышать:calm",
      "глубоко:calm",
      "глубоко:calm",
    ]);
    expect(marks(markPersonal("Алиментный Барсуки Алмазы", SAMPLE))).toEqual([]);
  });

  it("returns the text as is without highlights", () => {
    expect(markPersonal("Просто текст", [])).toEqual(["Просто текст"]);
    expect(markPersonal("", SAMPLE)).toEqual([]);
  });
});

/** Each sample's highlights in its language, as the catalog page builds them. */
const SAMPLES = {
  kk: [
    { value: "Алия", hint: "name" },
    { value: "Алматы", hint: "city" },
    { value: "Моншақ", hint: "toy" },
    { value: "жирен мысық Барсик", hint: "pet" },
    { value: "Гүлнар апай", hint: "teacher" },
  ],
  en: [
    { value: "Aliya", hint: "name" },
    { value: "Almaty", hint: "city" },
    { value: "Beady", hint: "toy" },
    { value: "ginger cat Barsik", hint: "pet" },
    { value: "when her brother takes her toys", hint: "trigger" },
  ],
  es: [
    { value: "Alía", hint: "name" },
    { value: "Almaty", hint: "city" },
    { value: "Perlita", hint: "toy" },
    { value: "gato pelirrojo Barsik", hint: "pet" },
    { value: "un patito amarillo", hint: "bath" },
  ],
  de: [
    { value: "Alija", hint: "name" },
    { value: "Almaty", hint: "city" },
    { value: "Perlchen", hint: "toy" },
    { value: "roter Kater Barsik", hint: "pet" },
    { value: "Freundin Aisha", hint: "friend" },
    { value: "eine gelbe Quietscheente", hint: "bath" },
    { value: "tief durchatmen", hint: "calm" },
  ],
} as const;

describe("in every book language", () => {
  it("finds Kazakh forms: suffixes stack, and a final қ or к softens", () => {
    const text = "Алияның мысығы Барсикке қарады. Алия Моншағын құшақтап, Алматыдағы Гүлнар апайға барды.";
    expect(marks(markPersonal(text, [...SAMPLES.kk], "kk"))).toEqual([
      "Алияның:name",
      "Барсикке:pet",
      "Алия:name",
      "Моншағын:toy",
      "Алматыдағы:city",
      "Гүлнар апайға:teacher",
    ]);
    expect(stem("Моншақ", "kk")).toBe("монша");
    expect(stem("Алия", "kk")).toBe("алия");
  });

  it("finds English possessives and plurals, not the little words of an answer", () => {
    const text = "Aliya's cat Barsik sat by Beady in Almaty. Her brother takes the toys when she is out.";
    expect(marks(markPersonal(text, [...SAMPLES.en], "en"))).toEqual([
      "Aliya:name",
      "Barsik:pet",
      "Beady:toy",
      "Almaty:city",
      "brother takes:trigger",
      "toys:trigger",
    ]);
  });

  it("finds Spanish forms across gender and number, accents included", () => {
    const text = "ALÍA y Perlita juegan en Almaty con dos patitos amarillos; Barsik mira.";
    expect(marks(markPersonal(text, [...SAMPLES.es], "es"))).toEqual([
      "ALÍA:name",
      "Perlita:toy",
      "Almaty:city",
      "patitos amarillos:bath",
      "Barsik:pet",
    ]);
  });

  it("takes only the name at the end of a German phrase, though every noun is capitalised", () => {
    expect(keyWords("roter Kater Barsik", "de")).toEqual(["Barsik"]);
    expect(keyWords("Freundin Aisha", "de")).toEqual(["Aisha"]);
    expect(keyWords("eine gelbe Quietscheente", "de")).toEqual(["Quietscheente"]);
    expect(keyWords("wenn der große Bruder die Spielsachen wegnimmt", "de")).toEqual(["Bruder", "Spielsachen"]);
    const text = "Alijas Kater Barsik schläft. Alija und Aisha atmen tief durch, die Quietscheenten schwimmen.";
    expect(marks(markPersonal(text, [...SAMPLES.de], "de"))).toEqual([
      "Alijas:name",
      "Barsik:pet",
      "Alija:name",
      "Aisha:friend",
      "tief:calm",
      "Quietscheenten:bath",
    ]);
  });

  it("drops German adjective endings but leaves nouns whole", () => {
    expect(stem("gelbe", "de")).toBe("gelb");
    expect(stem("Kater", "de")).toBe("kater");
    expect(marks(markPersonal("Katze und Kater", [{ value: "Kater", hint: "pet" }], "de"))).toEqual(["Kater:pet"]);
  });

  it("keeps the Russian rules by default", () => {
    expect(markPersonal("Алии", SAMPLE)).toEqual(markPersonal("Алии", SAMPLE, "ru"));
  });
});
