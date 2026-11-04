import type { Language } from "./language";

/**
 * Fixed words of a book, by its language. Phrased so the name never has to be declined. `drawingTitle`
 * heads a drawing page, `drawing` sits under its frame. `series` is
 * the cover's small subtitle; `spineUp` says the spine reads bottom to top (the continental European
 * and Russian way) rather than top to bottom (the English one).
 */
export const BOOK_LABELS: Record<
  Language,
  { madeFor: (name: string) => string; end: string; talk: string; drawing: string; drawingTitle: string; series: string; spineUp: boolean }
> = {
  ru: {
    madeFor: (name) => `Специально для тебя, ${name}!`,
    end: "Конец",
    talk: "Поговорим?",
    drawing: "Нарисуй здесь свою картинку к сказке",
    drawingTitle: "Мой рисунок",
    series: "Сказка Fabulka",
    spineUp: true,
  },
  kk: {
    madeFor: (name) => `Арнайы саған, ${name}!`,
    end: "Соңы",
    talk: "Әңгімелесейік",
    drawing: "Ертегіге өз суретіңді осында сал",
    drawingTitle: "Менің суретім",
    series: "Fabulka ертегісі",
    spineUp: true,
  },
  en: {
    madeFor: (name) => `Made just for you, ${name}!`,
    end: "The End",
    talk: "Let's talk",
    drawing: "Draw your own picture from the story here",
    drawingTitle: "My picture",
    series: "A Fabulka story",
    spineUp: false,
  },
  es: {
    madeFor: (name) => `¡Hecho especialmente para ti, ${name}!`,
    end: "Fin",
    talk: "¿Hablamos?",
    drawing: "Dibuja aquí tu propia escena del cuento",
    drawingTitle: "Mi dibujo",
    series: "Un cuento de Fabulka",
    spineUp: true,
  },
  de: {
    madeFor: (name) => `Extra für dich, ${name}!`,
    end: "Ende",
    talk: "Reden wir darüber?",
    drawing: "Male hier dein eigenes Bild zur Geschichte",
    drawingTitle: "Mein Bild",
    series: "Eine Fabulka-Geschichte",
    spineUp: true,
  },
};
