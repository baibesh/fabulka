import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ClientErrorReportSchema,
  type ClientErrorReport,
} from '@fabulka/shared';
import { CurrentClient, type Client } from '../common/client';
import { WindowLimiter } from '../common/limiter';
import { ZodPipe } from '../common/zod.pipe';
import { JournalService } from './journal.service';

/** Reports one visitor may send in TELEMETRY_WINDOW_MS; a page stuck in an error loop stops there. */
export const TELEMETRY_LIMIT = 30;
export const TELEMETRY_WINDOW_MS = 10 * 60 * 1000;

@Controller('telemetry')
export class TelemetryController {
  private readonly limiter = new WindowLimiter(
    TELEMETRY_LIMIT,
    TELEMETRY_WINDOW_MS,
  );

  constructor(private readonly journal: JournalService) {}

  /** An error the visitor saw in the browser, for the admin's journal. The client key is not kept. */
  @Post('error')
  @HttpCode(204)
  error(
    @Body(new ZodPipe(ClientErrorReportSchema)) body: ClientErrorReport,
    @CurrentClient() client: Client,
    @Headers('user-agent') userAgent?: string,
  ): void {
    if (!this.limiter.take(client.key)) {
      throw new HttpException(
        'Too many error reports',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.journal.recordClientError(body, userAgent);
  }
}
