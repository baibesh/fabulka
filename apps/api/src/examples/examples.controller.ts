import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CreateExampleSchema,
  ExampleBookRefSchema,
  ReorderExamplesSchema,
  TranslateExampleSchema,
  UpdateExampleSchema,
  type AdminExample,
  type CreateExample,
  type ExampleBookRef,
  type ExampleCandidate,
  type ReorderExamples,
  type TranslateExample,
  type UpdateExample,
  type VisitorMatrix,
} from '@fabulka/shared';
import type { AdminSession } from '../admin/admin-auth.service';
import {
  AdminGuard,
  CurrentAdmin,
  RequirePermission,
} from '../admin/admin.guard';
import { listScope } from '../admin/scope';
import { Audit, AuditTrail, Trail } from '../audit/audit.interceptor';
import { ZodPipe } from '../common/zod.pipe';
import { ExamplesService, spendCountry } from './examples.service';

/** The country an example's events belong to: the first it is shown only in; none for a global one. */
function exampleCountry(example: {
  countries: string[];
  countriesMode: string;
}): string | null {
  return example.countriesMode === 'include'
    ? (example.countries[0] ?? null)
    : null;
}

/** The fields of an example an audit event compares. */
const view = (example: AdminExample) => ({
  countries: example.countries,
  mode: example.countriesMode,
});

/**
 * The admin's «Examples»: stories on the home page with a version per language. Refusals carry a
 * code (EXAMPLE_ERRORS) the admin shows in its own words.
 *
 * Country scope: a country manager sees the examples shown in any of their countries and changes
 * only those shown in their countries alone (scope_forbidden otherwise); global examples and
 * "everywhere except…" ones are global staff's.
 */
@Controller('admin/examples')
@UseGuards(AdminGuard)
export class ExamplesAdminController {
  constructor(private readonly examples: ExamplesService) {}

  /** Also for a book's admin page, which offers to add the book to an example. */
  @Get()
  @RequirePermission('examples', 'books')
  list(@CurrentAdmin() session: AdminSession): Promise<AdminExample[]> {
    return this.examples.list(session);
  }

  /** A new example with this finished book as its first version, in these countries. */
  @Post()
  @RequirePermission('examples', 'books')
  @Audit('example.create', { target: 'example' })
  async create(
    @Body(new ZodPipe(CreateExampleSchema)) body: CreateExample,
    @CurrentAdmin() session: AdminSession,
    @Trail() trail: AuditTrail,
  ): Promise<AdminExample> {
    const example = await this.examples.create(
      body.bookId,
      body.countries,
      session,
    );
    trail
      .target('example', example.id)
      .in(exampleCountry(example))
      .diff(null, view(example))
      .note({ bookId: body.bookId });
    return example;
  }

  /** The home page's order. Declared before :id. */
  @Post('order')
  @RequirePermission('examples')
  @Audit('example.order', { target: 'examples' })
  reorder(
    @Body(new ZodPipe(ReorderExamplesSchema)) body: ReorderExamples,
    @CurrentAdmin() session: AdminSession,
    @Trail() trail: AuditTrail,
  ): Promise<AdminExample[]> {
    // A manager's order is of their countries' examples: theirs to see in Activity.
    trail
      .target('examples', null)
      .in(listScope(session, 'examples')?.[0] ?? null)
      .note({ ids: body.ids });
    return this.examples.reorder(body.ids, session);
  }

  /** What a visitor sees per country × language: the site's own selection. Declared before :id. */
  @Get('matrix')
  @RequirePermission('examples')
  matrix(@CurrentAdmin() session: AdminSession): Promise<VisitorMatrix> {
    return this.examples.matrix(session);
  }

  /** Finished books a new example may be made from (?country= narrows to one). Declared before :id. */
  @Get('candidates')
  @RequirePermission('examples', 'books')
  candidates(
    @CurrentAdmin() session: AdminSession,
    @Query('country') country?: string,
  ): Promise<ExampleCandidate[]> {
    return this.examples.candidates(session, country ?? null);
  }

  @Get(':id')
  @RequirePermission('examples', 'books')
  get(
    @Param('id') id: string,
    @CurrentAdmin() session: AdminSession,
  ): Promise<AdminExample> {
    return this.examples.get(id, session);
  }

  @Patch(':id')
  @RequirePermission('examples')
  @Audit('example.update', { target: 'example' })
  async update(
    @Param('id') id: string,
    @Body(new ZodPipe(UpdateExampleSchema)) body: UpdateExample,
    @CurrentAdmin() session: AdminSession,
    @Trail() trail: AuditTrail,
  ): Promise<AdminExample> {
    const before = await this.examples.get(id, session);
    const after = await this.examples.update(
      id,
      body.countries,
      body.mode,
      session,
    );
    trail
      .in(exampleCountry(after) ?? exampleCountry(before))
      .diff(view(before), view(after));
    return after;
  }

  /** Off the home page; its books stay. */
  @Delete(':id')
  @RequirePermission('examples')
  @Audit('example.delete', { target: 'example' })
  @HttpCode(204)
  async remove(
    @Param('id') id: string,
    @CurrentAdmin() session: AdminSession,
    @Trail() trail: AuditTrail,
  ): Promise<void> {
    const before = await this.examples.get(id, session);
    await this.examples.remove(id, session);
    trail.in(exampleCountry(before)).diff(view(before), null);
  }

  /** A finished book as the example's version in its language. */
  @Post(':id/versions')
  @RequirePermission('examples', 'books')
  @Audit('example.version_add', { target: 'example' })
  async addVersion(
    @Param('id') id: string,
    @Body(new ZodPipe(ExampleBookRefSchema)) body: ExampleBookRef,
    @CurrentAdmin() session: AdminSession,
    @Trail() trail: AuditTrail,
  ): Promise<AdminExample> {
    const example = await this.examples.addVersion(id, body.bookId, session);
    const version = example.versions.find((v) => v.bookId === body.bookId);
    trail
      .in(exampleCountry(example))
      .note({ bookId: body.bookId, language: version?.language ?? null });
    return example;
  }

  /** One version off the example; its book stays. */
  @Delete(':id/versions/:language')
  @RequirePermission('examples')
  @Audit('example.version_remove', { target: 'example' })
  @HttpCode(204)
  async removeVersion(
    @Param('id') id: string,
    @Param('language') language: string,
    @CurrentAdmin() session: AdminSession,
    @Trail() trail: AuditTrail,
  ): Promise<void> {
    const before = await this.examples.get(id, session);
    await this.examples.removeVersion(id, language, session);
    trail.in(exampleCountry(before)).note({ language });
  }

  /**
   * Starts translating the story into these languages (background jobs), within the person's and
   * the country's daily caps (429 staff_cap_reached). ?country= is the working country the spend
   * counts against when the example is shown there.
   */
  @Post(':id/translate')
  @RequirePermission('examples')
  @Audit('example.translate', { target: 'example' })
  async translate(
    @Param('id') id: string,
    @Body(new ZodPipe(TranslateExampleSchema)) body: TranslateExample,
    @CurrentAdmin() session: AdminSession,
    @Trail() trail: AuditTrail,
    @Query('country') country?: string,
  ): Promise<AdminExample> {
    const working = country?.trim().toUpperCase() || null;
    const example = await this.examples.translate(
      id,
      body.languages,
      session,
      working,
    );
    trail
      .in(spendCountry(example, working))
      .note({ languages: body.languages });
    return example;
  }
}
