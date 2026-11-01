/** The `hyphen` package ships no types: each language module exposes the same functions. */
declare module 'hyphen/*' {
  export function hyphenateSync(
    text: string,
    options?: { hyphenChar?: string; minWordLength?: number },
  ): string;
}
