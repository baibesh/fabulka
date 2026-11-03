import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { AuditQuerySchema, type AuditPage } from '@fabulka/shared';
import type { Response } from 'express';
import type { z } from 'zod';
import type { AdminSession } from '../admin/admin-auth.service';
import {
  AdminGuard,
  CurrentAdmin,
  RequirePermission,
} from '../admin/admin.guard';
import { ZodPipe } from '../common/zod.pipe';
import { AuditService } from './audit.service';

type Query = z.output<typeof AuditQuerySchema>;

/**
 * The admin's «Activity»: who changed what. The superadmin (and a global `audit` right) sees every
 * event; a country-scoped one only its countries' events (?country= narrows to the working country).
 */
@Controller('admin/activity')
@UseGuards(AdminGuard)
@RequirePermission('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(
    @CurrentAdmin() session: AdminSession,
    @Query(new ZodPipe(AuditQuerySchema)) query: Query,
  ): Promise<AuditPage> {
    return this.audit.list(session, query);
  }

  /** The people with events the session may see, for the person filter. */
  @Get('actors')
  actors(@CurrentAdmin() session: AdminSession): Promise<string[]> {
    return this.audit.actors(session);
  }

  /** The filtered list as a CSV file (newest first, at most 10 000 events). */
  @Get('export.csv')
  async csv(
    @CurrentAdmin() session: AdminSession,
    @Query(new ZodPipe(AuditQuerySchema)) query: Query,
    @Res() response: Response,
  ): Promise<void> {
    const csv = await this.audit.csv(session, query);
    const day = new Date().toISOString().slice(0, 10);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="fabulka-activity-${day}.csv"`,
    );
    response.send(csv);
  }
}
