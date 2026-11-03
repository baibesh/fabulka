import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CreatePageFlagSchema,
  CreateReferenceSchema,
  ReorderReferencesSchema,
  UpdatePageFlagSchema,
  UpdateReferenceSchema,
  type CreatePageFlag,
  type CreateReference,
  type ReorderReferences,
  type UpdateReference,
} from '@fabulka/shared';
import type { z } from 'zod';
import {
  AdminGuard,
  CurrentAdmin,
  RequirePermission,
} from '../admin/admin.guard';
import type { AdminSession } from '../admin/admin-auth.service';
import { Audit, AuditTrail, Trail } from '../audit/audit.interceptor';
import { ZodPipe } from '../common/zod.pipe';
import { FlagsService } from './flags.service';
import { ReferencesService } from './references.service';

/**
 * Admin «References»: the illustrators' pictures generation sends to Muse Image, and their review of
 * books (flagged pages). Every change goes into the Activity log.
 */
@Controller('admin')
@UseGuards(AdminGuard)
export class ReferencesController {
  constructor(
    private readonly references: ReferencesService,
    private readonly flags: FlagsService,
  ) {}

  @Get('references')
  @RequirePermission('references')
  list() {
    return this.references.list();
  }

  @Post('references')
  @RequirePermission('references')
  @Audit('reference.upload', { target: 'reference' })
  async create(
    @Body(new ZodPipe(CreateReferenceSchema)) body: CreateReference,
    @CurrentAdmin() session: AdminSession,
    @Trail() trail: AuditTrail,
  ) {
    const created = await this.references.create(body, session.who);
    trail.target('reference', created.id).note({
      kind: created.kind,
      theme: created.theme,
      methodology: created.methodology,
      beat: created.beat,
      bytes: created.bytes,
    });
    return created;
  }

  /** One slot's pictures in their new order. */
  @Put('references/order')
  @RequirePermission('references')
  @Audit('reference.order', { target: 'reference' })
  async reorder(
    @Body(new ZodPipe(ReorderReferencesSchema)) body: ReorderReferences,
    @Trail() trail: AuditTrail,
  ) {
    const list = await this.references.reorder(body.ids);
    trail.target('reference', body.ids[0]).note({ order: body.ids });
    return list;
  }

  @Patch('references/:id')
  @RequirePermission('references')
  @Audit('reference.update', { target: 'reference' })
  async update(
    @Param('id') id: string,
    @Body(new ZodPipe(UpdateReferenceSchema)) body: UpdateReference,
    @Trail() trail: AuditTrail,
  ) {
    const before = await this.references.get(id);
    const after = await this.references.update(id, body);
    trail.diff(
      { enabled: before.enabled, note: before.note },
      { enabled: after.enabled, note: after.note },
    );
    return after;
  }

  @Delete('references/:id')
  @RequirePermission('references')
  @Audit('reference.delete', { target: 'reference' })
  @HttpCode(204)
  async remove(@Param('id') id: string, @Trail() trail: AuditTrail) {
    const removed = await this.references.remove(id);
    trail.note({
      kind: removed.kind,
      theme: removed.theme,
      methodology: removed.methodology,
      beat: removed.beat,
    });
  }

  /** Flagged pages, open ones first; ?resolved=true|false narrows. */
  @Get('flags')
  @RequirePermission('books.review', 'references')
  listFlags(@Query('resolved') resolved?: string) {
    return this.flags.list(
      resolved === 'true' ? true : resolved === 'false' ? false : undefined,
    );
  }

  @Get('books/:id/flags')
  @RequirePermission('books.review')
  bookFlags(@Param('id') id: string) {
    return this.flags.forBook(id);
  }

  @Post('books/:id/flags')
  @RequirePermission('books.review')
  @Audit('book.flag', { target: 'book' })
  async flag(
    @Param('id') id: string,
    @Body(new ZodPipe(CreatePageFlagSchema)) body: CreatePageFlag,
    @CurrentAdmin() session: AdminSession,
    @Trail() trail: AuditTrail,
  ) {
    const flag = await this.flags.create(id, body, session.who);
    trail.note({ page: flag.page, flag: flag.id });
    return flag;
  }

  @Patch('flags/:id')
  @RequirePermission('books.review')
  @Audit('book.flag_update', { target: 'flag' })
  async setFlag(
    @Param('id') id: string,
    @Body(new ZodPipe(UpdatePageFlagSchema))
    body: z.infer<typeof UpdatePageFlagSchema>,
    @Trail() trail: AuditTrail,
  ) {
    const flag = await this.flags.setResolved(id, body.resolved);
    trail.note({ resolved: flag.resolved, book: flag.bookId });
    return flag;
  }
}
