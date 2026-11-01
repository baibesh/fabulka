import type { Language } from "./language";

/** Fixed words of a book, by its language. Phrased so the name never has to be declined. */
export const BOOK_LABELS: Record<Language, { madeFor: (name: string) => string; end: string; talk: string; drawing: string }> = {
  ru: { madeFor: (name) => `Специально для тебя, ${name}!`, end: "Конец", talk: "Поговорим?", drawing: "Нарисуй здесь свою картинку к сказке" },
  kk: { madeFor: (name) => `Арнайы саған, ${name}!`, end: "Соңы", talk: "Әңгімелесейік", drawing: "Ертегіге өз суретіңді осында сал" },
  en: { madeFor: (name) => `Made just for you, ${name}!`, end: "The End", talk: "Let's talk", drawing: "Draw your own picture from the story here" },
  es: { madeFor: (name) => `¡Hecho especialmente para ti, ${name}!`, end: "Fin", talk: "¿Hablamos?", drawing: "Dibuja aquí tu propia escena del cuento" },
  de: { madeFor: (name) => `Nur für dich gemacht, ${name}!`, end: "Ende", talk: "Lass uns reden", drawing: "Male hier dein eigenes Bild zur Geschichte" },
};
