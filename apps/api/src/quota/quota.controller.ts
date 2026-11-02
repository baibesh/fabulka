import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  DEFAULT_LANGUAGE,
  PurchaseSchema,
  type Purchase,
  type Quota,
} from '@fabulka/shared';
import { CurrentUser, type SessionUser } from '../auth/current-user';
import { CurrentClient, type Client } from '../common/client';
import { ZodPipe } from '../common/zod.pipe';
import { GeoService } from '../geo/geo.service';
import { ReferenceService } from '../reference/reference.service';
import { MailService } from '../mail/mail.service';
import { purchaseReceipt } from '../mail/templates';
import { QuotaService } from './quota.service';

@Controller('quota')
export class QuotaController {
  constructor(
    private readonly quota: QuotaService,
    private readonly mail: MailService,
    private readonly reference: ReferenceService,
    private readonly geo: GeoService,
  ) {}

  @Get()
  get(@CurrentClient() client: Client): Promise<Quota> {
    return this.quota.quota(client.key, client.demoCode);
  }

  /**
   * Demo checkout for one more book of the given kind: nothing is charged. Priced in the currency
   * of the visitor's country. The receipt goes to the email typed at checkout, else to the
   * signed-in parent's.
   */
  @Post('purchase')
  async purchase(
    @CurrentClient() client: Client,
    @CurrentUser() user: SessionUser | null,
    @Body(new ZodPipe(PurchaseSchema)) body: Purchase,
  ): Promise<Quota> {
    const country = await this.reference.visitorCountry(
      client.country,
      this.geo.country(client.ip),
    );
    const { quota, price } = await this.quota.buyBook(
      client.key,
      body.kind,
      country,
    );
    const email = body.email ?? user?.email;
    if (email) {
      void this.mail.send(
        email,
        purchaseReceipt(
          { kind: body.kind, price },
          body.locale ?? DEFAULT_LANGUAGE,
          this.mail.publicUrl,
        ),
      );
    }
    return quota;
  }
}
