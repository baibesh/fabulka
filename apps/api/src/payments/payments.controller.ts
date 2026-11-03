import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';

/** Where payment providers call back. Manual payments never do; Kaspi and Stripe are not wired in yet. */
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post(':provider/webhook')
  @HttpCode(200)
  webhook(
    @Param('provider') provider: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
  ) {
    return this.payments.webhook(provider, headers, body);
  }
}
