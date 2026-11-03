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
import { ZodPipe } from '../common/zod.pipe';
import { ExamplesService } from './examples.service';

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
  create(
    @Body(new ZodPipe(CreateExampleSchema)) body: CreateExample,
    @CurrentAdmin() session: AdminSession,
  ): Promise<AdminExample> {
    return this.examples.create(body.bookId, body.countries, session);
  }

  /** The home page's order. Declared before :id. */
  @Post('order')
  @RequirePermission('examples')
  reorder(
    @Body(new ZodPipe(ReorderExamplesSchema)) body: ReorderExamples,
    @CurrentAdmin() session: AdminSession,
  ): Promise<AdminExample[]> {
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
  update(
    @Param('id') id: string,
    @Body(new ZodPipe(UpdateExampleSchema)) body: UpdateExample,
    @CurrentAdmin() session: AdminSession,
  ): Promise<AdminExample> {
    return this.examples.update(id, body.countries, body.mode, session);
  }

  /** Off the home page; its books stay. */
  @Delete(':id')
  @RequirePermission('examples')
  @HttpCode(204)
  remove(
    @Param('id') id: string,
    @CurrentAdmin() session: AdminSession,
  ): Promise<void> {
    return this.examples.remove(id, session);
  }

  /** A finished book as the example's version in its language. */
  @Post(':id/versions')
  @RequirePermission('examples', 'books')
  addVersion(
    @Param('id') id: string,
    @Body(new ZodPipe(ExampleBookRefSchema)) body: ExampleBookRef,
    @CurrentAdmin() session: AdminSession,
  ): Promise<AdminExample> {
    return this.examples.addVersion(id, body.bookId, session);
  }

  /** One version off the example; its book stays. */
  @Delete(':id/versions/:language')
  @RequirePermission('examples')
  @HttpCode(204)
  removeVersion(
    @Param('id') id: string,
    @Param('language') language: string,
    @CurrentAdmin() session: AdminSession,
  ): Promise<void> {
    return this.examples.removeVersion(id, language, session);
  }

  /** Starts translating the story into these languages (background jobs). */
  @Post(':id/translate')
  @RequirePermission('examples')
  translate(
    @Param('id') id: string,
    @Body(new ZodPipe(TranslateExampleSchema)) body: TranslateExample,
    @CurrentAdmin() session: AdminSession,
  ): Promise<AdminExample> {
    return this.examples.translate(id, body.languages, session);
  }
}
