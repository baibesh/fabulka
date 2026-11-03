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
  UpdateStaffRoleSchema,
  UpdateStaffSchema,
} from '@fabulka/shared';
import type { z } from 'zod';
import type { AdminSession } from '../admin/admin-auth.service';
import {
  AdminGuard,
  CurrentAdmin,
  RequirePermission,
} from '../admin/admin.guard';
import { ZodPipe } from '../common/zod.pipe';
import { TeamService } from './team.service';

/** The admin's Team: staff, invitations and roles. Only the superadmin holds `team`. */
@Controller('admin/team')
@UseGuards(AdminGuard)
@RequirePermission('team')
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get()
  list() {
    return this.team.list();
  }

  @Post()
  invite(
    @Body(new ZodPipe(InviteStaffSchema))
    body: z.output<typeof InviteStaffSchema>,
    @CurrentAdmin() session: AdminSession,
  ) {
    return this.team.invite(body, session);
  }

  @Get('roles')
  roles() {
    return this.team.roles();
  }

  @Post('roles')
  createRole(
    @Body(new ZodPipe(CreateStaffRoleSchema))
    body: z.output<typeof CreateStaffRoleSchema>,
  ) {
    return this.team.createRole(body);
  }

  @Put('roles/:key')
  updateRole(
    @Param('key') key: string,
    @Body(new ZodPipe(UpdateStaffRoleSchema))
    body: z.output<typeof UpdateStaffRoleSchema>,
  ) {
    return this.team.updateRole(key, body);
  }

  @Delete('roles/:key')
  @HttpCode(204)
  deleteRole(@Param('key') key: string) {
    return this.team.deleteRole(key);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodPipe(UpdateStaffSchema))
    body: z.output<typeof UpdateStaffSchema>,
  ) {
    return this.team.update(id, body);
  }

  @Post(':id/disable')
  @HttpCode(200)
  disable(@Param('id') id: string) {
    return this.team.disable(id);
  }

  @Post(':id/enable')
  @HttpCode(200)
  enable(@Param('id') id: string) {
    return this.team.enable(id);
  }

  @Post(':id/resend')
  @HttpCode(200)
  resend(@Param('id') id: string) {
    return this.team.resend(id);
  }
}
