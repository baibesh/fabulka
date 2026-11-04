import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ADMIN_RIGHTS, type AdminSearch, type Inbox } from '@fabulka/shared';
import { AdminGuard, CurrentAdmin, RequirePermission } from './admin.guard';
import type { AdminSession } from './admin-auth.service';
import { InboxService } from './inbox.service';

/** A ?country= as an upper-case ISO code, or null for the global workspace. */
function countryParam(value: string | undefined): string | null {
  const code = value?.trim().toUpperCase();
  return code && /^[A-Z]{2}$/.test(code) ? code : null;
}

/** The admin's Inbox and the command palette's search: any admin role may ask; the rows follow its rights. */
@Controller('admin')
@UseGuards(AdminGuard)
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  /** What waits for someone: the global workspace's rows, or one country's (?country=). */
  @Get('inbox')
  @RequirePermission(...ADMIN_RIGHTS)
  list(
    @CurrentAdmin() session: AdminSession,
    @Query('country') country?: string,
  ): Promise<Inbox> {
    return this.inbox.inbox(session, countryParam(country));
  }

  /** Books by title, child's name or id and orders by number, for the command palette (?q=). */
  @Get('search')
  @RequirePermission(...ADMIN_RIGHTS)
  search(
    @CurrentAdmin() session: AdminSession,
    @Query('q') q?: string,
  ): Promise<AdminSearch> {
    return this.inbox.search(session, q ?? '');
  }
}
