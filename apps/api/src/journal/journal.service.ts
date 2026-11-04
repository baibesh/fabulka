import {
  Global,
  Injectable,
  Logger,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  ClientErrorReport,
  ModelCallKind,
  PipelineStepId,
} from '@fabulka/shared';
import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaService } from '../prisma/prisma.service';
import { CONTENT_POLICY, isSafetyRefusal } from '../meta/refusal';

/** Error messages are cut to this many characters. */
const MESSAGE_LIMIT = 1000;
/** The prompt and output of a failed call are cut to this many characters. */
const TEXT_LIMIT = 8000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Prompts and outputs of failed calls are forgotten after this many days. */
export const TEXT_RETENTION_DAYS = 30;
/** Model calls and browser errors are deleted after this many days. */
export const RETENTION_DAYS = 90;

/** What generation tells the journal about the calls inside it; voice prefill has no book. */
export interface JournalContext {
  bookId?: string;
  /** A staff action (an example translation, a theme proposal): who started it, for staff caps. */
  staffEmail?: string | null;
  /** The country that staff action was for. */
  staffCountry?: string | null;
  /** The pipeline step the calls inside are for (PIPELINE_STEP_IDS), and the page and frame. */
  step?: PipelineStepId;
  page?: number;
  frame?: number;
}

/** What a model call is, known before it is sent. */
export interface CallStart {
  kind: ModelCallKind;
  model: string;
  /** The text sent to the model; stored only when the call fails. */
  prompt?: string;
  /** 1 for the first try; our own retries count up. */
  attempt?: number;
  /** Illustrator references (their ids) sent with the call as pictures. */
  references?: string[];
}

/** What came back from a model call. */
export interface CallOutcome {
  costUsd: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  images?: number;
  responseId?: string | null;
}

/** A failed call: what the model answered (if anything) and our own error code for it. */
export interface CallFailure extends Partial<CallOutcome> {
  code?: string;
  output?: string;
}

type ModelCallRow = Prisma.ModelCallUncheckedCreateInput;

/**
 * The journal the admin studies: one row per model call (each of our own retries too) and the
 * errors visitors saw in the browser. Writing a row never throws and never makes generation wait.
 */
@Injectable()
export class JournalService implements OnModuleDestroy {
  private readonly logger = new Logger(JournalService.name);
  private readonly context = new AsyncLocalStorage<JournalContext>();
  private readonly pending = new Set<Promise<void>>();

  constructor(private readonly prisma: PrismaService) {}

  /** Runs `task` so that every model call inside it is recorded against the book. */
  run<T>(context: JournalContext, task: () => Promise<T>): Promise<T> {
    return this.context.run(context, task);
  }

  /**
   * Runs `task` as a pipeline step: its model calls keep the book (and staff) of the run around it
   * and are recorded with the step, page and frame, so each row can be found on the pipeline graph.
   */
  step<T>(
    step: PipelineStepId,
    where: { page?: number; frame?: number },
    task: () => Promise<T>,
  ): Promise<T> {
    const outer = this.context.getStore() ?? {};
    return this.context.run(
      { ...outer, step, page: where.page, frame: where.frame },
      task,
    );
  }

  /** Starts timing a model call. */
  start(call: CallStart): ModelCallTimer {
    return new ModelCallTimer(
      (row) => this.record(row),
      call,
      this.context.getStore(),
    );
  }

  /** Stores a row in the background; a failure to store it is only logged. */
  record(row: ModelCallRow): void {
    this.background(
      () => this.prisma.modelCall.create({ data: row }),
      `could not record a ${row.kind} call`,
    );
  }

  /** An error a visitor saw; the user agent comes from the request header. */
  recordClientError(report: ClientErrorReport, userAgent?: string): void {
    this.background(
      () =>
        this.prisma.clientError.create({
          data: {
            ...report,
            userAgent: userAgent?.slice(0, 200) || null,
          },
        }),
      'could not record a browser error',
    );
  }

  /** Resolves once the rows written so far are stored (tests, shutdown). */
  async idle(): Promise<void> {
    await Promise.all([...this.pending]);
  }

  async onModuleDestroy() {
    await this.idle();
  }

  /**
   * Retention: prompts and outputs of failed calls go after 30 days, the rows themselves (and the
   * browser errors) after 90.
   */
  async prune(now = new Date()) {
    const textCutoff = new Date(now.getTime() - TEXT_RETENTION_DAYS * DAY_MS);
    const rowCutoff = new Date(now.getTime() - RETENTION_DAYS * DAY_MS);
    const [texts, calls, errors] = await Promise.all([
      this.prisma.modelCall.updateMany({
        where: {
          createdAt: { lt: textCutoff },
          OR: [{ prompt: { not: null } }, { output: { not: null } }],
        },
        data: { prompt: null, output: null },
      }),
      this.prisma.modelCall.deleteMany({
        where: { createdAt: { lt: rowCutoff } },
      }),
      this.prisma.clientError.deleteMany({
        where: { createdAt: { lt: rowCutoff } },
      }),
    ]);
    return { texts: texts.count, calls: calls.count, errors: errors.count };
  }

  private background(write: () => Promise<unknown>, problem: string) {
    let done: Promise<void>;
    try {
      done = write().then(
        () => undefined,
        (error: unknown) => this.logger.warn(`${problem}: ${describe(error)}`),
      );
    } catch (error) {
      this.logger.warn(`${problem}: ${describe(error)}`);
      return;
    }
    this.pending.add(done);
    void done.then(() => this.pending.delete(done));
  }
}

/** What a model gateway needs from the journal. */
export type CallJournal = Pick<JournalService, 'start'>;

/** Records nothing: for a gateway made outside Nest, as in unit tests. */
export const NO_JOURNAL: CallJournal = {
  start: (call) => new ModelCallTimer(() => undefined, call, undefined),
};

/** One model call being timed. The first ok() or fail() records it; later ones are ignored. */
export class ModelCallTimer {
  private readonly started = performance.now();
  private finished = false;

  constructor(
    private readonly record: (row: ModelCallRow) => void,
    private readonly call: CallStart,
    private readonly context: JournalContext | undefined,
  ) {}

  /** Awaits the request; when it throws, the call is recorded as failed and the error passed on. */
  async request<T>(promise: Promise<T>): Promise<T> {
    try {
      return await promise;
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  ok(outcome: CallOutcome): void {
    this.finish({ ...this.base(outcome), status: 'ok' });
  }

  fail(error: unknown, failure: CallFailure = {}): void {
    const { code, output, ...outcome } = failure;
    this.finish({
      ...this.base({ costUsd: 0, ...outcome }),
      status: 'error',
      errorCode: code ?? errorCode(error),
      errorMessage: describe(error).slice(0, MESSAGE_LIMIT),
      // Only a failed call keeps its texts: they may hold the child's data, so admin-only, 30 days.
      prompt: this.call.prompt?.slice(0, TEXT_LIMIT) || null,
      output: output?.slice(0, TEXT_LIMIT) || null,
    });
  }

  private base(outcome: CallOutcome) {
    return {
      bookId: this.context?.bookId ?? null,
      staffEmail: this.context?.staffEmail ?? null,
      staffCountry: this.context?.staffCountry ?? null,
      kind: this.call.kind,
      model: this.call.model,
      attempt: this.call.attempt ?? 1,
      latencyMs: Math.round(performance.now() - this.started),
      inputTokens: outcome.inputTokens ?? null,
      outputTokens: outcome.outputTokens ?? null,
      images: outcome.images ?? 0,
      costUsd: outcome.costUsd,
      responseId: outcome.responseId ?? null,
      references: this.call.references ?? [],
      step: this.context?.step ?? null,
      page: this.context?.page ?? null,
      frame: this.context?.frame ?? null,
    };
  }

  private finish(row: ModelCallRow) {
    if (this.finished) return;
    this.finished = true;
    this.record(row);
  }
}

/** A short machine-readable reason: the HTTP status, a timeout, a dropped connection. */
export function errorCode(error: unknown): string {
  if (isSafetyRefusal(error)) return CONTENT_POLICY;
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === 'number') return `http_${status}`;
  if (error instanceof SyntaxError) return 'invalid_output';
  const names =
    error instanceof Error ? [error.name, error.constructor.name] : [];
  if (
    names.some((n) => n === 'APIConnectionTimeoutError' || n === 'TimeoutError')
  )
    return 'timeout';
  if (names.includes('APIConnectionError')) return 'connection';
  if (names.includes('ZodError')) return 'invalid_output';
  return 'error';
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Runs the retention once a day, and once on start. */
@Injectable()
export class JournalCleaner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JournalCleaner.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly journal: JournalService) {}

  onModuleInit() {
    const sweep = () =>
      this.journal
        .prune()
        .then(({ texts, calls, errors }) => {
          if (texts + calls + errors)
            this.logger.log(
              `journal retention: ${texts} prompts forgotten, ${calls} calls and ${errors} browser errors deleted`,
            );
        })
        .catch((error: unknown) =>
          this.logger.error('journal retention failed', error),
        );
    void sweep();
    this.timer = setInterval(() => void sweep(), DAY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }
}

@Global()
@Module({
  providers: [JournalService, JournalCleaner],
  exports: [JournalService],
})
export class JournalModule {}
