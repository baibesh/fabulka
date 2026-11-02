import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ExampleBookRefSchema,
  ReorderExamplesSchema,
  TranslateExampleSchema,
  UpdateExampleSchema,
  type AdminExample,
  type ExampleBookRef,
  type ReorderExamples,
  type TranslateExample,
  type UpdateExample,
} from '@fabulka/shared';
import { AdminGuard, RequirePermission } from '../admin/admin.guard';
import { ZodPipe } from '../common/zod.pipe';
import { ExamplesService } from './examples.service';

/**
 * The admin's «Examples»: stories on the home page with a version per language. Refusals carry a
 * code (EXAMPLE_ERRORS) the admin shows in its own words.
 */
@Controller('admin/examples')
@UseGuards(AdminGuard)
export class ExamplesAdminController {
  constructor(private readonly examples: ExamplesService) {}

  /** Also for a book's admin page, which offers to add the book to an example. */
  @Get()
  @RequirePermission('examples', 'books')
  list(): Promise<AdminExample[]> {
    return this.examples.list();
  }

  /** A new example with this finished book as its first version. */
  @Post()
  @RequirePermission('examples', 'books')
  create(
    @Body(new ZodPipe(ExampleBookRefSchema)) body: ExampleBookRef,
  ): Promise<AdminExample> {
    return this.examples.create(body.bookId);
  }

  /** The home page's order. Declared before :id. */
  @Post('order')
  @RequirePermission('examples')
  reorder(
    @Body(new ZodPipe(ReorderExamplesSchema)) body: ReorderExamples,
  ): Promise<AdminExample[]> {
    return this.examples.reorder(body.ids);
  }

  @Get(':id')
  @RequirePermission('examples', 'books')
  get(@Param('id') id: string): Promise<AdminExample> {
    return this.examples.get(id);
  }

  @Patch(':id')
  @RequirePermission('examples')
  update(
    @Param('id') id: string,
    @Body(new ZodPipe(UpdateExampleSchema)) body: UpdateExample,
  ): Promise<AdminExample> {
    return this.examples.update(id, body.countries);
  }

  /** Off the home page; its books stay. */
  @Delete(':id')
  @RequirePermission('examples')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.examples.remove(id);
  }

  /** A finished book as the example's version in its language. */
  @Post(':id/versions')
  @RequirePermission('examples', 'books')
  addVersion(
    @Param('id') id: string,
    @Body(new ZodPipe(ExampleBookRefSchema)) body: ExampleBookRef,
  ): Promise<AdminExample> {
    return this.examples.addVersion(id, body.bookId);
  }

  /** One version off the example; its book stays. */
  @Delete(':id/versions/:language')
  @RequirePermission('examples')
  @HttpCode(204)
  removeVersion(
    @Param('id') id: string,
    @Param('language') language: string,
  ): Promise<void> {
    return this.examples.removeVersion(id, language);
  }

  /** Starts translating the story into these languages (background jobs). */
  @Post(':id/translate')
  @RequirePermission('examples')
  translate(
    @Param('id') id: string,
    @Body(new ZodPipe(TranslateExampleSchema)) body: TranslateExample,
  ): Promise<AdminExample> {
    return this.examples.translate(id, body.languages);
  }
}
