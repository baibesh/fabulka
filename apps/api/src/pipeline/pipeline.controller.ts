import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  PipelineStatsQuerySchema,
  allowedFor,
  type AdminAccess,
  type AdminRight,
  type PipelineStats,
  type PipelineTrace,
  type TraceBook,
} from '@fabulka/shared';
import type { z } from 'zod';
import {
  AdminGuard,
  CurrentAdmin,
  RequirePermission,
} from '../admin/admin.guard';
import type { AdminSession } from '../admin/admin-auth.service';
import { outOfScope } from '../admin/scope';
import { ZodPipe } from '../common/zod.pipe';
import { PipelineService } from './pipeline.service';

/** Who may see each node's live stats: the journal's or the formats' staff. */
export const STATS_RIGHTS: AdminRight[] = [
  'journal',
  'story_formats',
  'story_formats.read',
];
/** Who may trace a book: the journal's or the books' staff. */
export const TRACE_RIGHTS: AdminRight[] = ['journal', 'books'];

/**
 * The journal covers every country, so the Pipeline page is Global's: a right held only in some
 * countries does not open it (403 scope_forbidden).
 */
export function assertGlobal(
  session: AdminAccess,
  rights: readonly AdminRight[],
): void {
  if (!rights.some((right) => allowedFor(session, right, null)))
    throw outOfScope('The pipeline is global staff’s');
}

/** The admin's Pipeline page: live stats on a format's graph and one book's trace. */
@Controller('admin/pipeline')
@UseGuards(AdminGuard)
export class PipelineController {
  constructor(private readonly pipeline: PipelineService) {}

  /** Each node's calls, cost, latency, errors and refusals for books of ?format= in ?period=. */
  @Get('stats')
  @RequirePermission(...STATS_RIGHTS)
  stats(
    @CurrentAdmin() session: AdminSession,
    @Query(new ZodPipe(PipelineStatsQuerySchema))
    query: z.infer<typeof PipelineStatsQuerySchema>,
  ): Promise<PipelineStats> {
    assertGlobal(session, STATS_RIGHTS);
    return this.pipeline.stats(query.format, query.period);
  }

  /** Books to trace by title, child's name or id (?q=, ?format=); the latest without a query. */
  @Get('books')
  @RequirePermission(...TRACE_RIGHTS)
  books(
    @CurrentAdmin() session: AdminSession,
    @Query('q') q?: string,
    @Query('format') format?: string,
  ): Promise<TraceBook[]> {
    assertGlobal(session, TRACE_RIGHTS);
    return this.pipeline.books(
      (q ?? '').slice(0, 100),
      format?.slice(0, 60) || undefined,
    );
  }

  /** One book's run on the graph, from its journal rows by step, page and frame. */
  @Get('trace/:bookId')
  @RequirePermission(...TRACE_RIGHTS)
  trace(
    @CurrentAdmin() session: AdminSession,
    @Param('bookId') bookId: string,
  ): Promise<PipelineTrace> {
    assertGlobal(session, TRACE_RIGHTS);
    return this.pipeline.trace(bookId);
  }
}
