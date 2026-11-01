import { HttpException } from '@nestjs/common';
import type { Client } from '../common/client';
import type { JournalService } from './journal.service';
import { TELEMETRY_LIMIT, TelemetryController } from './telemetry.controller';

const report = {
  kind: 'js' as const,
  message: 'Cannot read properties of undefined',
  path: '/create',
};
const client = (key: string): Client => ({
  key,
  demoCode: undefined,
  ip: '127.0.0.1',
  country: undefined,
});

describe('TelemetryController', () => {
  it('takes 30 reports per visitor, then refuses with 429', () => {
    const recordClientError = jest.fn();
    const controller = new TelemetryController({
      recordClientError,
    } as unknown as JournalService);

    for (let i = 0; i < TELEMETRY_LIMIT; i++) {
      controller.error(report, client('a'), 'Mozilla/5.0');
    }
    let refused: unknown;
    try {
      controller.error(report, client('a'));
    } catch (error) {
      refused = error;
    }
    // Another visitor is counted on their own.
    controller.error(report, client('b'));

    expect(refused).toBeInstanceOf(HttpException);
    expect((refused as HttpException).getStatus()).toBe(429);
    expect(recordClientError).toHaveBeenCalledTimes(TELEMETRY_LIMIT + 1);
    expect(recordClientError).toHaveBeenCalledWith(report, 'Mozilla/5.0');
  });
});
