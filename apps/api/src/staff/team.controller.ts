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
  UseGuards,
} from '@nestjs/common';
import {
  CreateStaffRoleSchema,
  InviteStaffSchema,
  StaffCapDefaultsSchema,
  StaffCapOverrideSchema,
  UpdateStaffRoleSchema,
  UpdateStaffSchema,
  type StaffCapDefaults,
} from '@fabulka/shared';
import type { z } from 'zod';
import type { AdminSession } from '../admin/admin-auth.service';
import {
  AdminGuard,
  CurrentAdmin,
  RequirePermission,
} from '../admin/admin.guard';
import { Audit, AuditTrail, Trail } from '../audit/audit.interceptor';
import { ZodPipe } from '../common/zod.pipe';
import { StaffCapsService } from './caps.service';
import { roleAuditView, staffAuditView, TeamService } from './team.service';

/**
 * The admin's Team: staff, invitations, roles and the daily caps on staff generation. Only the
 * superadmin holds `team`. Every change is in Activity with what changed.
 */
@Controller('admin/team')
@UseGuards(AdminGuard)
@RequirePermission('team')
export class TeamController {
  constructor(
    private readonly team: TeamService,
    private readonly caps: StaffCapsService,
  ) {}

  @Get()
  list() {
    return this.team.list();
  }

  @Post()
  @Audit('staff.invite', { target: 'staff' })
  async invite(
    @Body(new ZodPipe(InviteStaffSchema))
    body: z.output<typeof InviteStaffSchema>,
    @CurrentAdmin() session: AdminSession,
    @Trail() trail: AuditTrail,
  ) {
    const result = await this.team.invite(body, session);
    trail
      .target('staff', result.member.id)
      .diff(null, staffAuditView(result.member))
      .note({ email: result.email });
    return result;
  }

  /** The default daily caps (each person, each country), in dollars; null is no cap. */
  @Get('caps')
  capDefaults(): Promise<StaffCapDefaults> {
    return this.caps.defaults();
  }

  @Put('caps')
  @Audit('caps.defaults', { target: 'caps' })
  async setCapDefaults(
    @Body(new ZodPipe(StaffCapDefaultsSchema)) body: StaffCapDefaults,
    @Trail() trail: AuditTrail,
  ): Promise<StaffCapDefaults> {
    const before = await this.caps.defaults();
    const after = await this.caps.setDefaults(body);
    trail.target('caps', 'defaults').diff(before, after);
    return after;
  }

  @Get('roles')
  roles() {
    return this.team.roles();
  }

  @Post('roles')
  @Audit('role.create', { target: 'role' })
  async createRole(
    @Body(new ZodPipe(CreateStaffRoleSchema))
    body: z.output<typeof CreateStaffRoleSchema>,
    @Trail() trail: AuditTrail,
  ) {
    const role = await this.team.createRole(body);
    trail.target('role', role.key).diff(null, roleAuditView(role));
    return role;
  }

  @Put('roles/:key')
  @Audit('role.update', { target: 'role' })
  async updateRole(
    @Param('key') key: string,
    @Body(new ZodPipe(UpdateStaffRoleSchema))
    body: z.output<typeof UpdateStaffRoleSchema>,
    @Trail() trail: AuditTrail,
  ) {
    const before = await this.team.role(key);
    const after = await this.team.updateRole(key, body);
    trail.diff(roleAuditView(before), roleAuditView(after));
    return after;
  }

  @Delete('roles/:key')
  @Audit('role.delete', { target: 'role' })
  @HttpCode(204)
  async deleteRole(@Param('key') key: string, @Trail() trail: AuditTrail) {
    const before = await this.team.role(key);
    await this.team.deleteRole(key);
    trail.diff(roleAuditView(before), null);
  }

  @Patch(':id')
  @Audit('staff.update', { target: 'staff' })
  async update(
    @Param('id') id: string,
    @Body(new ZodPipe(UpdateStaffSchema))
    body: z.output<typeof UpdateStaffSchema>,
    @Trail() trail: AuditTrail,
  ) {
    const before = await this.team.member(id);
    const after = await this.team.update(id, body);
    trail.diff(staffAuditView(before), staffAuditView(after));
    return after;
  }

  /** Their own daily cap on staff generation (null: the default), or none at all. */
  @Put(':id/cap')
  @Audit('staff.cap', { target: 'staff' })
  async setCap(
    @Param('id') id: string,
    @Body(new ZodPipe(StaffCapOverrideSchema))
    body: z.output<typeof StaffCapOverrideSchema>,
    @Trail() trail: AuditTrail,
  ) {
    const before = await this.team.member(id);
    const after = await this.team.setCap(id, body);
    trail.diff(
      { capUsd: before.capUsd, uncapped: before.uncapped },
      { capUsd: after.capUsd, uncapped: after.uncapped },
    );
    return after;
  }

  @Post(':id/disable')
  @Audit('staff.disable', { target: 'staff' })
  @HttpCode(200)
  async disable(@Param('id') id: string, @Trail() trail: AuditTrail) {
    const member = await this.team.disable(id);
    trail.note({ email: member.email });
    return member;
  }

  @Post(':id/enable')
  @Audit('staff.enable', { target: 'staff' })
  @HttpCode(200)
  async enable(@Param('id') id: string, @Trail() trail: AuditTrail) {
    const member = await this.team.enable(id);
    trail.note({ email: member.email });
    return member;
  }

  @Post(':id/resend')
  @Audit('staff.resend', { target: 'staff' })
  @HttpCode(200)
  async resend(@Param('id') id: string, @Trail() trail: AuditTrail) {
    const result = await this.team.resend(id);
    trail.note({ email: result.member.email, sent: result.email });
    return result;
  }
}
