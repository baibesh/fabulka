import { Logger } from '@nestjs/common';
import {
  TYPICAL_SECONDS,
  type ModelCallKind,
  type StepTimings,
} from '@fabulka/shared';
import type { PrismaService } from '../prisma/prisma.service';

/** The journal's kind behind each typical duration. */
const KINDS: Record<keyof StepTimings, ModelCallKind> = {
  toyCutout: 'toy-cutout',
  toyDescribe: 'toy-describe',
  story: 'story',
  review: 'review',
  hero: 'hero',
  pet: 'pet',
  toySheet: 'toy-sheet',
  page: 'page',
  pageMask: 'page-mask',
  render: 'render',
};

/** Fewer successful calls than this in the period and the measured typical duration is used. */
export const MIN_CALLS = 5;
const PERIOD_MS = 7 * 24 * 3600_000;
const FRESH_MS = 10 * 60_000;

export interface KindAverage {
  kind: string;
  calls: number;
  avgMs: number | null;
}

/** Typical durations from the journal's averages; a kind with too few calls keeps the fallback. */
export function timingsFrom(
  rows: KindAverage[],
  fallback: StepTimings = TYPICAL_SECONDS,
): StepTimings {
  const timings = { ...fallback };
  for (const key of Object.keys(KINDS) as (keyof StepTimings)[]) {
    const row = rows.find((r) => r.kind === KINDS[key]);
    if (row && row.calls >= MIN_CALLS && row.avgMs !== null)
      timings[key] = Math.round(row.avgMs / 100) / 10;
  }
  return timings;
}

/**
 * How long each model call usually takes, for the progress screen's estimate: the last week's
 * successful calls in the journal (of the models in use), refreshed every ten minutes in the
 * background. Never blocks a request and never fails one: until the first answer, or when the query
 * fails, the measured TYPICAL_SECONDS are used.
 */
export class GenerationTimings {
  private readonly logger = new Logger(GenerationTimings.name);
  private value: StepTimings = TYPICAL_SECONDS;
  private fetchedAt = 0;
  private pending: Promise<void> | null = null;

  /**
   * `mock`: the books are made by the mock models, so only their calls are averaged (and only real
   * models' calls otherwise): a developer's mock runs never make the real estimate look instant.
   */
  constructor(
    private readonly prisma: PrismaService,
    private readonly mock = false,
  ) {}

  current(now = Date.now()): StepTimings {
    if (now - this.fetchedAt > FRESH_MS && !this.pending) {
      this.pending = this.refresh(now).finally(() => (this.pending = null));
    }
    return this.value;
  }

  async refresh(now = Date.now()): Promise<void> {
    this.fetchedAt = now;
    try {
      const rows = await this.prisma.modelCall.groupBy({
        by: ['kind'],
        where: {
          status: 'ok',
          // Render QA runs in Chromium either way.
          model: this.mock ? { in: ['mock', 'chromium'] } : { not: 'mock' },
          kind: { in: Object.values(KINDS) },
          createdAt: { gte: new Date(now - PERIOD_MS) },
        },
        _avg: { latencyMs: true },
        _count: { _all: true },
      });
      this.value = timingsFrom(
        rows.map((r) => ({
          kind: r.kind,
          calls: r._count._all,
          avgMs: r._avg.latencyMs,
        })),
      );
    } catch (error) {
      this.logger.warn(
        `typical durations not read: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
