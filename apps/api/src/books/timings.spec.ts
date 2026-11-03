import { TYPICAL_SECONDS } from '@fabulka/shared';
import type { PrismaService } from '../prisma/prisma.service';
import { GenerationTimings, MIN_CALLS, timingsFrom } from './timings';

describe('timingsFrom', () => {
  it('takes the journal average of a kind with enough calls, in seconds', () => {
    const timings = timingsFrom([
      { kind: 'page', calls: 40, avgMs: 31_250 },
      { kind: 'story', calls: MIN_CALLS - 1, avgMs: 90_000 },
      { kind: 'hero', calls: 12, avgMs: null },
    ]);
    expect(timings.page).toBe(31.3);
    // Too few calls, or no average: the measured typical duration stays.
    expect(timings.story).toBe(TYPICAL_SECONDS.story);
    expect(timings.hero).toBe(TYPICAL_SECONDS.hero);
    expect(timings.render).toBe(TYPICAL_SECONDS.render);
  });
});

describe('GenerationTimings', () => {
  it('answers at once with the fallback, then the journal once read, and keeps it for a while', async () => {
    const groupBy = jest
      .fn()
      .mockResolvedValue([
        { kind: 'pet', _count: { _all: 9 }, _avg: { latencyMs: 20_000 } },
      ]);
    const timings = new GenerationTimings({
      modelCall: { groupBy },
    } as unknown as PrismaService);
    expect(timings.current(1_000_000)).toEqual(TYPICAL_SECONDS);
    await new Promise((resolve) => setImmediate(resolve));
    expect(timings.current(1_000_001).pet).toBe(20);
    expect(groupBy).toHaveBeenCalledTimes(1);
    // Real models: the mock's calls are left out.
    expect((groupBy.mock.calls as unknown[][])[0][0]).toMatchObject({
      where: { status: 'ok', model: { not: 'mock' } },
    });
    timings.current(1_000_000 + 11 * 60_000);
    expect(groupBy).toHaveBeenCalledTimes(2);
  });

  it('keeps the fallback when the journal cannot be read', async () => {
    const timings = new GenerationTimings({
      modelCall: { groupBy: jest.fn().mockRejectedValue(new Error('down')) },
    } as unknown as PrismaService);
    timings.current();
    await new Promise((resolve) => setImmediate(resolve));
    expect(timings.current()).toEqual(TYPICAL_SECONDS);
  });
});
