import type { JournalService } from '../journal/journal.service';
import type { ModelGateway } from '../meta/model-gateway';
import type { PdfService } from '../pdf/pdf.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';
import { ThemesService } from './themes.service';

/** A ThemesService for unit tests: the curated themes, no proposed ones stored. */
export function curatedThemes(): ThemesService {
  return new ThemesService(
    {
      theme: { findMany: () => Promise.resolve([]) },
    } as unknown as PrismaService,
    {} as ModelGateway,
    {} as PdfService,
    {} as StorageService,
    {} as JournalService,
  );
}
