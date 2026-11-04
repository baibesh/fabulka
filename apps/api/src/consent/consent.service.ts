import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  CONSENT_LANGUAGES,
  ConsentClauseSchema,
  DEFAULT_CONSENT,
  DEFAULT_LANGUAGE,
  type AdminConsent,
  type AdminConsentVersion,
  type ConsentClause,
  type Language,
} from '@fabulka/shared';
import { PrismaService } from '../prisma/prisma.service';

/** The consent a parent gives before the child's photo goes to Meta (the photo path). */
export const HERO_PHOTO_CONSENT = 'hero_photo';

type Row = {
  language: string;
  version: number;
  clauses: Prisma.JsonValue;
  createdBy: string | null;
  createdAt: Date;
};

/**
 * Consent texts by language, versioned: every save adds a version, the newest is shown, and a book
 * keeps the version its parent accepted. Version 1 in every language is seeded on start.
 */
@Injectable()
export class ConsentService implements OnModuleInit {
  private readonly logger = new Logger(ConsentService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.seed();
    } catch (error) {
      this.logger.error('could not seed the consent texts', error);
    }
  }

  /** Version 1 of every language that has none yet. */
  async seed(): Promise<void> {
    const have = await this.prisma.consentText.findMany({
      where: { key: HERO_PHOTO_CONSENT },
      select: { language: true },
      distinct: ['language'],
    });
    const missing = CONSENT_LANGUAGES.filter(
      (language) => !have.some((row) => row.language === language),
    );
    if (!missing.length) return;
    await this.prisma.consentText.createMany({
      data: missing.map((language) => ({
        key: HERO_PHOTO_CONSENT,
        language,
        version: 1,
        clauses: DEFAULT_CONSENT[language],
      })),
      skipDuplicates: true,
    });
  }

  /** The newest version in `language` (English when that language has none, else the default text). */
  async current(language: Language): Promise<AdminConsentVersion> {
    for (const lang of [language, DEFAULT_LANGUAGE] as Language[]) {
      const row = await this.prisma.consentText.findFirst({
        where: { key: HERO_PHOTO_CONSENT, language: lang },
        orderBy: { version: 'desc' },
      });
      if (row) return view(row);
    }
    return {
      language,
      version: 1,
      clauses: DEFAULT_CONSENT[language],
      createdAt: new Date(0).toISOString(),
      createdBy: null,
    };
  }

  /** Whether `version` is the one the parent must accept now in `language`. */
  async isCurrent(language: Language, version: number): Promise<boolean> {
    const now = await this.current(language);
    return now.language === language && now.version === version;
  }

  /** Every language's current version and its history (newest first), for the admin. */
  async admin(): Promise<AdminConsent> {
    const rows = await this.prisma.consentText.findMany({
      where: { key: HERO_PHOTO_CONSENT },
      orderBy: [{ language: 'asc' }, { version: 'desc' }],
    });
    return {
      languages: await Promise.all(
        CONSENT_LANGUAGES.map(async (language) => {
          const history = rows
            .filter((row) => row.language === language)
            .map(view);
          return {
            language,
            current: history[0] ?? (await this.current(language)),
            history,
          };
        }),
      ),
    };
  }

  /**
   * A new version of one language's clauses. Saving clauses identical to the current ones adds no
   * version (returns the current one, `changed: false`).
   */
  async save(
    language: Language,
    clauses: ConsentClause[],
    who: string | null,
  ): Promise<{
    before: AdminConsentVersion;
    after: AdminConsentVersion;
    changed: boolean;
  }> {
    const before = await this.current(language);
    if (
      before.language === language &&
      JSON.stringify(before.clauses) === JSON.stringify(clauses)
    )
      return { before, after: before, changed: false };
    const last = await this.prisma.consentText.findFirst({
      where: { key: HERO_PHOTO_CONSENT, language },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const row = await this.prisma.consentText.create({
      data: {
        key: HERO_PHOTO_CONSENT,
        language,
        version: (last?.version ?? 0) + 1,
        clauses: clauses,
        createdBy: who,
      },
    });
    return { before, after: view(row), changed: true };
  }
}

function view(row: Row): AdminConsentVersion {
  const clauses = ConsentClauseSchema.array().safeParse(row.clauses);
  return {
    language: row.language as Language,
    version: row.version,
    clauses: clauses.success ? clauses.data : [],
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
  };
}
