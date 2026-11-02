/**
 * Cookies the site keeps for the visitor; read on the server too (so plain constants, no client code).
 * The country sets prices, currency, the catalog and the FAQ, so the server needs it for the first
 * render. The language is a preference only: the address decides the language of a page, this
 * cookie only lets the site offer the visitor's version (see LocaleSuggestion), never redirect.
 */
export const COUNTRY_COOKIE = "fabulka_country";
export const LOCALE_COOKIE = "fabulka_locale";
/** A year, in seconds. */
export const COOKIE_MAX_AGE = 365 * 24 * 60 * 60;
