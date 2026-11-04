import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  buildTrace,
  nodeStats,
  normalizePages,
  type ChildProfile,
  type GraphNodeId,
  type PipelinePeriod,
  type PipelineStats,
  type PipelineTrace,
  type StatsRow,
  type TraceBook,
} from '@fabulka/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS: Record<PipelinePeriod, number> = { '7d': 7, '30d': 30 };
/** Calls of one book the trace reads at most (a comic of 8 pages makes about 80). */
const TRACE_CALLS = 2000;
/** Books the trace's search lists. */
const SEARCH_LIMIT = 20;
/** Journal rows of the voice input: they belong to no book, so every format shows them. */
const WIZARD_KINDS = ['voice-transcribe', 'voice-extract'];

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * The admin's Pipeline page: the journal summed onto the graph of a format (each step's calls, cost,
 * latency, errors and refusals) and one book's run on it (the trace and its replay).
 */
@Injectable()
export class PipelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Each node's calls for books of `format` in the period (the voice input: everyone's). */
  async stats(
    format: string,
    period: PipelinePeriod,
    now = Date.now(),
  ): Promise<PipelineStats> {
    const from = new Date(now - PERIOD_DAYS[period] * DAY_MS);
    const [rows, books, references] = await Promise.all([
      this.prisma.$queryRaw<StatsRow[]>(Prisma.sql`
        select mc.step, mc.kind, count(*)::int as calls,
          count(distinct mc."bookId")::int as books,
          (count(*) filter (where mc.status = 'error'))::int as errors,
          (count(*) filter (where mc."errorCode" = 'content_policy'))::int as refusals,
          coalesce(sum(mc."costUsd"), 0)::float as cost,
          coalesce(sum(mc."latencyMs"), 0)::float as latency
        from "ModelCall" mc
        left join "Book" b on b.id = mc."bookId"
        where mc."createdAt" >= ${from}
          and (b."storyFormat" = ${format}
            or (mc."bookId" is null and mc.kind in (${Prisma.join(WIZARD_KINDS)})))
        group by mc.step, mc.kind`),
      this.prisma.book.aggregate({
        where: { storyFormat: format, createdAt: { gte: from } },
        _count: true,
        _sum: { costUsd: true },
      }),
      this.prisma.illustratorReference.groupBy({
        by: ['kind', 'enabled'],
        _count: true,
      }),
    ]);
    const byKind = new Map<string, { enabled: number; total: number }>();
    for (const r of references) {
      const k = byKind.get(r.kind) ?? { enabled: 0, total: 0 };
      k.total += r._count;
      if (r.enabled) k.enabled += r._count;
      byKind.set(r.kind, k);
    }
    return {
      format,
      period,
      books: books._count,
      costUsd: books._sum.costUsd ?? 0,
      nodes: nodeStats(rows),
      references: [...byKind].map(([kind, k]) => ({ kind, ...k })),
    };
  }

  /** Books by title, child's name or id (newest first), for the trace's picker; empty: the latest. */
  async books(q: string, format?: string): Promise<TraceBook[]> {
    const query = q.trim();
    const like = `%${escapeLike(query)}%`;
    const prefix = `${escapeLike(query)}%`;
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        title: string | null;
        childName: string | null;
        format: string;
        status: string;
        calls: number;
        createdAt: Date;
      }[]
    >(Prisma.sql`
      select b.id, b.title, b.child->>'name' as "childName", b."storyFormat" as format,
        b.status::text as status, b."createdAt",
        (select count(*) from "ModelCall" mc where mc."bookId" = b.id)::int as calls
      from "Book" b
      where (${query} = '' or b.id ilike ${prefix} or b.title ilike ${like} or b.child->>'name' ilike ${like})
        and (${format ?? ''} = '' or b."storyFormat" = ${format ?? ''})
      order by b."createdAt" desc
      limit ${SEARCH_LIMIT}`);
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      childName: r.childName ?? '',
      format: r.format,
      status: r.status,
      calls: r.calls,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** One book's run: its calls in the order they were sent, each node's share, every frame. */
  async trace(bookId: string): Promise<PipelineTrace> {
    const book = await this.prisma.book.findUnique({ where: { id: bookId } });
    if (!book) throw new NotFoundException(`book ${bookId} not found`);
    const rows = await this.prisma.modelCall.findMany({
      where: { bookId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: TRACE_CALLS,
    });
    const pages = normalizePages(book.pages);
    const frames = pages.flatMap((p) =>
      p.frames.map((f) => ({
        page: p.page,
        frame: f.frame,
        imageUrl: this.storage.url(f.imagePath),
        scene: f.scenePrompt,
        art: f.art ?? null,
      })),
    );
    const images: PipelineTrace['images'] = {};
    const picture = (node: GraphNodeId, label: string, path: string | null) => {
      const url = this.storage.url(path);
      if (url) images[node] = [...(images[node] ?? []), { label, url }];
    };
    picture('toy.cutout', 'toy', book.toyCutoutPath);
    picture('sheet.hero', 'hero', book.heroImagePath);
    picture('sheet.pet', 'pet', book.petImagePath);
    picture('sheet.toy', 'toy', book.toyImagePath);
    const cast = Array.isArray(book.cast)
      ? (book.cast as { name?: string; imagePath?: string | null }[])
      : [];
    for (const member of cast)
      picture('sheet.cast', member.name ?? '', member.imagePath ?? null);
    picture('cover.draw', 'cover', book.coverImagePath);
    const drawn = frames.find((f) => f.imageUrl);
    if (drawn?.imageUrl)
      images['frame.draw'] = frames
        .filter((f) => f.imageUrl)
        .slice(0, 6)
        .map((f) => ({ label: `${f.page}.${f.frame}`, url: f.imageUrl! }));
    const pdf = this.storage.url(book.pdfPath);
    if (pdf) images['book.pdf'] = [{ label: 'pdf', url: pdf }];

    return {
      book: {
        id: book.id,
        title: book.title,
        childName: (book.child as unknown as ChildProfile | null)?.name ?? '',
        format: book.storyFormat,
        status: book.status,
        language: book.language,
        heroSource: book.heroSource,
        costUsd: book.costUsd,
        createdAt: book.createdAt.toISOString(),
      },
      ...buildTrace(rows, frames),
      images,
    };
  }
}
