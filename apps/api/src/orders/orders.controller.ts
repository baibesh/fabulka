import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  CreateOrderSchema,
  type CreateOrderInput,
  type Order,
} from '@fabulka/shared';
import { CurrentUser, type SessionUser } from '../auth/current-user';
import { CurrentClient, type Client } from '../common/client';
import { ZodPipe } from '../common/zod.pipe';
import { GeoService } from '../geo/geo.service';
import { ReferenceService } from '../reference/reference.service';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly reference: ReferenceService,
    private readonly geo: GeoService,
  ) {}

  /** 400 print_unavailable when the visitor's country has no print. */
  @Post()
  async create(
    @Body(new ZodPipe(CreateOrderSchema)) body: CreateOrderInput,
    @CurrentClient() client: Client,
    @CurrentUser() user: SessionUser | null,
  ): Promise<Order> {
    const country = await this.reference.visitorCountry(
      client.country,
      this.geo.country(client.ip),
    );
    return this.orders.create(body, client.key, user?.id, country);
  }

  @Get(':id')
  get(
    @Param('id') id: string,
    @CurrentClient() client: Client,
    @CurrentUser() user: SessionUser | null,
  ): Promise<Order> {
    return this.orders.get(id, client.key, user?.id);
  }
}
