import type { Language } from '@fabulka/shared';

/**
 * Languages added after the seed methods and catalog books first went into the database: on start
 * their seed texts are filled in wherever a stored one has none in that language (never replacing
 * what is there).
 */
export const ADDED_LANGUAGES: readonly Language[] = ['es', 'de'];
