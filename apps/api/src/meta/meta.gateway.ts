import OpenAI from 'openai';
import type { Response, Tool } from 'openai/resources/responses/responses';
import { z } from 'zod';
import {
  BOOK_FONTS,
  GRID,
  LANGUAGE_MODEL_NAMES,
  ProposedThemeSchema,
  StorySchema,
  encodeGrid,
  type PageSubject,
  type Language,
  type ModelCallKind,
  type Story,
} from '@fabulka/shared';
import type {
  GeneratedImage,
  GeneratedStory,
  ModelGateway,
  PrefillFields,
} from './model-gateway';
import {
  type CallJournal,
  type CallOutcome,
  NO_JOURNAL,
} from '../journal/journal.service';
import { cutout, type Segment } from '../toy/cutout';
import { jpegSize } from '../toy/jpeg-size';
import { sanitizePrefill } from '../voice/prefill';
import {
  PREFILL_INSTRUCTIONS,
  prefillPrompt,
  type PrefillBrief,
  REVIEW_INSTRUCTIONS,
  reviewPrompt,
  STORY_INSTRUCTIONS,
  TOY_DESCRIPTION_PROMPT,
  type Companions,
  type StoryBrief,
  type TextSpace,
  heroPrompt,
  ornamentPrompt,
  themeInstructions,
  themePrompt,
  toyPrompt,
  pagePrompt,
  petPrompt,
  storyPrompt,
} from './prompts';

/** Muse Spark Standard mode, USD per 1M tokens (dev.meta.ai/docs/pricing-rate-limits). */
const SPARK_INPUT_PER_M = 1.25;
const SPARK_OUTPUT_PER_M = 4.25;
/** Muse Image is a flat price per generated image. */
const IMAGE_PRICE = 0.01;
/** SAM 3.1: $2.50 per 1,000 images. */
const SAM_PRICE = 0.0025;
/** Muse Voice Transcribe: $0.18 per hour of audio, metered in whole seconds. */
const TRANSCRIBE_PER_SECOND = 0.18 / 3600;
const TRANSCRIBE_MODEL = 'muse-voice-transcribe-1.0';
/** Languages the speech model is biased toward; Kazakh speakers often switch to Russian. */
const LANGUAGE_BIAS: Record<Language, string[]> = {
  ru: [LANGUAGE_MODEL_NAMES.ru],
  kk: [LANGUAGE_MODEL_NAMES.kk, LANGUAGE_MODEL_NAMES.ru],
  en: [LANGUAGE_MODEL_NAMES.en],
  es: [LANGUAGE_MODEL_NAMES.es],
  de: [LANGUAGE_MODEL_NAMES.de],
};
/** What SAM is asked to find in the parent's photo. */
const TOY_CONCEPT = 'toy';
/**
 * What SAM is asked to find in a page illustration, one short noun phrase per request. "child" missed
 * the grandfather, the eagle and the dog the text must not cover either; "character" missed animals
 * and "person or animal" finds nothing, so people and animals are asked for separately.
 */
const SUBJECT_CONCEPTS = ['person', 'animal'];
const STORY_ATTEMPTS = 3;

export interface MetaGatewayOptions {
  apiKey: string;
  baseURL: string;
  storyModel: string;
  imageModel: string;
  samModel: string;
}

/** The Meta Model API, through the OpenAI SDK's Responses API. */
export class MetaGateway implements ModelGateway {
  private readonly client: OpenAI;

  /** Every request, each of our own retries too, goes into the journal (JournalService). */
  constructor(
    private readonly options: MetaGatewayOptions,
    private readonly journal: CallJournal = NO_JOURNAL,
  ) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      maxRetries: 4,
      timeout: 180_000,
    });
  }

  async writeStory(brief: StoryBrief): Promise<GeneratedStory> {
    let costUsd = 0;
    let error = '';
    for (let attempt = 0; attempt < STORY_ATTEMPTS; attempt++) {
      const input =
        storyPrompt(brief) +
        (error ? `\nYour previous output was invalid: ${error}` : '');
      const call = this.journal.start({
        kind: 'story',
        model: this.options.storyModel,
        prompt: input,
        attempt: attempt + 1,
      });
      const response = await call.request(
        this.client.responses.create({
          model: this.options.storyModel,
          instructions: STORY_INSTRUCTIONS,
          input,
          text: { format: { type: 'json_object' } },
        }),
      );
      costUsd += tokenCost(response);
      try {
        const story = StorySchema.parse(JSON.parse(response.output_text));
        call.ok(spend(response));
        return { story, costUsd };
      } catch (problem) {
        call.fail(problem, {
          ...spend(response),
          code: 'invalid_output',
          output: response.output_text,
        });
        error =
          problem instanceof Error
            ? problem.message.slice(0, 500)
            : String(problem);
      }
    }
    throw new Error(
      `Muse Spark returned an invalid story ${STORY_ATTEMPTS} times: ${error}`,
    );
  }

  async reviewStory(
    story: Story,
    age: number,
    language: Language,
  ): Promise<{ safe: boolean; reason: string; costUsd: number }> {
    const input = reviewPrompt(JSON.stringify(story), age, language);
    const call = this.journal.start({
      kind: 'review',
      model: this.options.storyModel,
      prompt: input,
    });
    const response = await call.request(
      this.client.responses.create({
        model: this.options.storyModel,
        instructions: REVIEW_INSTRUCTIONS,
        input,
        text: { format: { type: 'json_object' } },
      }),
    );
    const unreadable = {
      ...spend(response),
      code: 'invalid_output',
      output: response.output_text,
    };
    let parsed: ReturnType<typeof ReviewSchema.safeParse>;
    try {
      parsed = ReviewSchema.safeParse(JSON.parse(response.output_text || '{}'));
    } catch (problem) {
      call.fail(problem, unreadable);
      throw problem;
    }
    // An unreadable verdict is not a pass.
    const verdict = parsed.success
      ? parsed.data
      : { safe: false, reason: 'the safety review returned no verdict' };
    if (parsed.success) call.ok(spend(response));
    else call.fail(new Error(verdict.reason), unreadable);
    return { ...verdict, costUsd: tokenCost(response) };
  }

  async findToy(
    photo: Buffer,
  ): Promise<{ cutout: Buffer | null; costUsd: number }> {
    // ESM-only package; loaded on first use.
    const sam = await import('@meta-sam/parser');
    const { recordsOfKind, decodeMaskToRaster } = sam;
    const call = this.journal.start({
      kind: 'toy-cutout',
      model: this.options.samModel,
      prompt: TOY_CONCEPT,
    });
    const { records } = await call.request(
      this.segment(sam, photo, TOY_CONCEPT),
    );
    call.ok({ costUsd: SAM_PRICE, images: 1 });
    // Several matches: the biggest one is the toy the photo is of.
    const largest = [...recordsOfKind(records, 'mask')].sort(
      (a, b) => area(b.bounds) - area(a.bounds),
    )[0];
    if (!largest) return { cutout: null, costUsd: SAM_PRICE };
    return {
      cutout: cutout(photo, {
        box: largest.bounds,
        mask: decodeMaskToRaster(largest.mask),
        maskWidth: largest.mask.width,
        maskHeight: largest.mask.height,
      }),
      costUsd: SAM_PRICE,
    };
  }

  async findSubject(
    image: Buffer,
  ): Promise<{ subject: PageSubject; costUsd: number }> {
    const sam = await import('@meta-sam/parser');
    const size = jpegSize(image);
    if (!size) throw new Error('SAM gets JPEG page illustrations only');
    const found = await Promise.all(
      SUBJECT_CONCEPTS.map(async (concept) => {
        const call = this.journal.start({
          kind: 'page-mask',
          model: this.options.samModel,
          prompt: concept,
        });
        const { records } = await call.request(
          this.segment(sam, image, concept),
        );
        call.ok({ costUsd: SAM_PRICE, images: 1 });
        return [...sam.recordsOfKind(records, 'mask')];
      }),
    );
    const masks = found.flat().map((record) => ({
      box: record.bounds,
      mask: sam.decodeMaskToRaster(record.mask),
      maskWidth: record.mask.width,
      maskHeight: record.mask.height,
    }));
    return {
      subject: subjectGrid(masks, size),
      costUsd: SAM_PRICE * SUBJECT_CONCEPTS.length,
    };
  }

  /** Streams SAM's answer for the photo and returns the parsed masks. */
  private async segment(
    { parseImageStream }: typeof import('@meta-sam/parser'),
    photo: Buffer,
    concept: string,
  ) {
    const events = await this.client.responses.create({
      model: this.options.samModel,
      input: [
        {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: concept },
            { type: 'input_image', image_url: dataUrl(photo), detail: 'auto' },
          ],
        },
      ],
      stream: true,
      metadata: { mask_encoding: 'one_bit' },
    });
    const parsed = parseImageStream(events as never);
    for await (const snapshot of parsed) void snapshot;
    const result = await parsed.finalResult;
    // A stream cut short leaves masks missing: no mask is better than a wrong one.
    if (result.outcome.status !== 'completed') {
      throw new Error(
        `SAM stopped early: ${JSON.stringify(result.outcome).slice(0, 200)}`,
      );
    }
    return result;
  }

  async describeToy(
    image: Buffer,
  ): Promise<{ description: string; costUsd: number }> {
    const call = this.journal.start({
      kind: 'toy-describe',
      model: this.options.storyModel,
      prompt: TOY_DESCRIPTION_PROMPT,
    });
    const response = await call.request(
      this.client.responses.create({
        model: this.options.storyModel,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: TOY_DESCRIPTION_PROMPT },
              {
                type: 'input_image',
                image_url: dataUrl(image),
                detail: 'auto',
              },
            ],
          },
        ],
      }),
    );
    const description = response.output_text.trim().replace(/\.$/, '');
    if (!description) {
      const error = new Error('Muse Spark returned no toy description');
      call.fail(error, {
        ...spend(response),
        code: 'empty_output',
        output: response.output_text,
      });
      throw error;
    }
    call.ok(spend(response));
    return { description, costUsd: tokenCost(response) };
  }

  /** Muse Spark proposes a theme as JSON; a reply that is not a valid proposal is asked for again. */
  async proposeTheme(
    brief: string,
  ): Promise<{ proposal: unknown; costUsd: number }> {
    const fonts = Object.entries(BOOK_FONTS);
    const instructions = themeInstructions({
      body: fonts.filter(([, f]) => f.body).map(([family]) => family),
      display: fonts.filter(([, f]) => !f.body).map(([family]) => family),
      weights: Object.fromEntries(
        fonts.map(([family, f]) => [family, f.weights]),
      ),
    });
    let costUsd = 0;
    let error = '';
    for (let attempt = 0; attempt < STORY_ATTEMPTS; attempt++) {
      const input =
        themePrompt(brief) +
        (error ? `\nYour previous output was invalid: ${error}` : '');
      const call = this.journal.start({
        kind: 'theme',
        model: this.options.storyModel,
        prompt: input,
        attempt: attempt + 1,
      });
      const response = await call.request(
        this.client.responses.create({
          model: this.options.storyModel,
          instructions,
          input,
          text: { format: { type: 'json_object' } },
          // Left to itself Spark reasoned ~15k tokens (80 s, $0.07) over a small JSON the code checks anyway.
          reasoning: { effort: 'low' },
        }),
      );
      costUsd += tokenCost(response);
      try {
        const proposal = ProposedThemeSchema.parse(
          JSON.parse(response.output_text),
        );
        call.ok(spend(response));
        return { proposal, costUsd };
      } catch (problem) {
        call.fail(problem, {
          ...spend(response),
          code: 'invalid_output',
          output: response.output_text,
        });
        error =
          problem instanceof Error
            ? problem.message.slice(0, 500)
            : String(problem);
      }
    }
    throw new Error(
      `Muse Spark returned an invalid theme ${STORY_ATTEMPTS} times: ${error}`,
    );
  }

  /**
   * A PNG on white: Muse Image accepts `background: transparent` but ignores it (its API reference
   * says so), so the white is keyed out afterwards (PdfService.cleanOrnament).
   */
  drawOrnament(prompt: string): Promise<GeneratedImage> {
    return this.draw(
      'ornament',
      ornamentPrompt(prompt),
      '1024x1024',
      undefined,
      undefined,
      { output_format: 'png' },
    );
  }

  drawToy(
    toyDescription: string,
    reference: Buffer,
    anchorRef: string,
    style?: string,
  ): Promise<GeneratedImage> {
    return this.draw(
      'toy-sheet',
      toyPrompt(toyDescription, style),
      '1024x1024',
      anchorRef,
      reference,
    );
  }

  drawHero(heroDescription: string, style?: string): Promise<GeneratedImage> {
    return this.draw('hero', heroPrompt(heroDescription, style), '1024x1024');
  }

  drawPet(
    petDescription: string,
    heroRef: string,
    style?: string,
  ): Promise<GeneratedImage> {
    return this.draw(
      'pet',
      petPrompt(petDescription, style),
      '1024x1024',
      heroRef,
    );
  }

  drawPage(
    scenePrompt: string,
    anchorRef: string,
    companions: Companions,
    style?: string,
    textSpace?: TextSpace,
  ): Promise<GeneratedImage> {
    return this.draw(
      'page',
      pagePrompt(scenePrompt, companions, style, textSpace),
      '1536x1024',
      anchorRef,
    );
  }

  /** POST /asr/transcribe is not part of the OpenAI SDK: a multipart request of its own. */
  async transcribe(
    wav: Buffer,
    language: Language,
  ): Promise<{ text: string; costUsd: number }> {
    const form = new FormData();
    form.append(
      'request',
      new Blob(
        [
          JSON.stringify({
            model: TRANSCRIBE_MODEL,
            audioEncoding: 'WAV',
            mode: 'PUSH_TO_TALK',
            languageBias: LANGUAGE_BIAS[language],
          }),
        ],
        { type: 'application/json' },
      ),
    );
    form.append(
      'audio',
      new Blob([new Uint8Array(wav)], { type: 'audio/wav' }),
      'recording.wav',
    );
    // The recording itself never goes into the journal, not even when the call fails.
    const call = this.journal.start({
      kind: 'voice-transcribe',
      model: TRANSCRIBE_MODEL,
    });
    const response = await call.request(
      fetch(`${this.options.baseURL}/asr/transcribe`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          Accept: 'application/json',
        },
        body: form,
        signal: AbortSignal.timeout(60_000),
      }),
    );
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      const error = new Error(
        `Muse Voice Transcribe answered ${response.status}: ${detail}`,
      );
      call.fail(error, { code: `http_${response.status}` });
      throw error;
    }
    const body = await call.request(
      response.json().then((json) => TranscribeResponseSchema.parse(json)),
    );
    const costUsd =
      Math.floor(body.audioDurationMs / 1000) * TRANSCRIBE_PER_SECOND;
    call.ok({ costUsd });
    return { text: body.transcript.trim(), costUsd };
  }

  async extractPrefill(
    brief: PrefillBrief,
  ): Promise<{ fields: PrefillFields; costUsd: number }> {
    const input = prefillPrompt(brief);
    const call = this.journal.start({
      kind: 'voice-extract',
      model: this.options.storyModel,
      prompt: input,
    });
    const response = await call.request(
      this.client.responses.create({
        model: this.options.storyModel,
        instructions: PREFILL_INSTRUCTIONS,
        input,
        text: { format: { type: 'json_object' } },
      }),
    );
    let raw: unknown = {};
    try {
      raw = JSON.parse(response.output_text || '{}');
      call.ok(spend(response));
    } catch (problem) {
      // Unreadable JSON fills in nothing; the transcript is still shown.
      call.fail(problem, {
        ...spend(response),
        code: 'invalid_output',
        output: response.output_text,
      });
    }
    return {
      fields: sanitizePrefill(raw, brief.questions, brief.theme),
      costUsd: tokenCost(response),
    };
  }

  private async draw(
    kind: ModelCallKind,
    prompt: string,
    size: '1024x1024' | '1536x1024',
    previousResponseId?: string,
    reference?: Buffer,
    extra: { output_format?: 'png' } = {},
  ): Promise<GeneratedImage> {
    // Web and image search add latency and nothing for invented characters.
    const tool = {
      type: 'image_generation',
      size,
      // JPEG keeps a 10-page PDF small enough to download; PNG made it ~5 MB a page.
      output_format: 'jpeg',
      enable_web_search: false,
      enable_image_search: false,
      ...extra,
    } as unknown as Tool;
    const call = this.journal.start({
      kind,
      model: this.options.imageModel,
      prompt,
    });
    const response = await call.request(
      this.client.responses.create({
        model: this.options.imageModel,
        // A reference photo goes in as an image part next to the prompt.
        input: reference
          ? [
              {
                role: 'user',
                content: [
                  { type: 'input_text', text: prompt },
                  {
                    type: 'input_image',
                    image_url: dataUrl(reference),
                    detail: 'auto',
                  },
                ],
              },
            ]
          : prompt,
        tools: [tool],
        ...(previousResponseId
          ? { previous_response_id: previousResponseId }
          : {}),
      }),
    );
    const image = response.output.find(
      (item) => item.type === 'image_generation_call',
    );
    if (!image || image.type !== 'image_generation_call' || !image.result) {
      const error = new Error(
        `Muse Image returned no image (response ${response.id}, status ${response.status})`,
      );
      call.fail(error, {
        ...usage(response),
        code: 'no_image',
        output: response.output_text,
      });
      throw error;
    }
    call.ok({ ...usage(response), costUsd: IMAGE_PRICE, images: 1 });
    return {
      data: Buffer.from(image.result, 'base64'),
      ext: extra.output_format ?? 'jpeg',
      ref: response.id,
      costUsd: IMAGE_PRICE,
    };
  }
}

function tokenCost(response: Response): number {
  const usage = response.usage;
  if (!usage) return 0;
  return (
    (usage.input_tokens * SPARK_INPUT_PER_M +
      usage.output_tokens * SPARK_OUTPUT_PER_M) /
    1_000_000
  );
}

/** Tokens and the response id of a call, for the journal. */
function usage(response: Response): Omit<CallOutcome, 'costUsd'> {
  return {
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
    responseId: response.id,
  };
}

/** A Muse Spark call for the journal: its tokens and what they cost. */
function spend(response: Response): CallOutcome {
  return { ...usage(response), costUsd: tokenCost(response) };
}

const ReviewSchema = z.object({ safe: z.boolean(), reason: z.string() });
const TranscribeResponseSchema = z.object({
  transcript: z.string(),
  audioDurationMs: z.number().default(0),
});

function dataUrl(jpeg: Buffer): string {
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
}

/** SAM's masks (each over its box, in image pixels) as one GRID×GRID mask of the whole picture. */
export function subjectGrid(
  masks: Segment[],
  size: { width: number; height: number },
): PageSubject {
  if (!masks.length) return { box: null, grid: '' };
  const cells: boolean[] = [];
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const x = ((gx + 0.5) / GRID) * size.width;
      const y = ((gy + 0.5) / GRID) * size.height;
      cells.push(
        masks.some(({ box, mask, maskWidth, maskHeight }) => {
          if (x < box.left || x >= box.right || y < box.top || y >= box.bottom)
            return false;
          const mx = Math.floor(
            ((x - box.left) * maskWidth) / (box.right - box.left),
          );
          const my = Math.floor(
            ((y - box.top) * maskHeight) / (box.bottom - box.top),
          );
          return mask[my * maskWidth + mx] === 1;
        }),
      );
    }
  }
  const left = Math.min(...masks.map((m) => m.box.left));
  const top = Math.min(...masks.map((m) => m.box.top));
  const right = Math.max(...masks.map((m) => m.box.right));
  const bottom = Math.max(...masks.map((m) => m.box.bottom));
  return {
    box: {
      x: left / size.width,
      y: top / size.height,
      w: (right - left) / size.width,
      h: (bottom - top) / size.height,
    },
    grid: encodeGrid(cells),
  };
}

function area(box: {
  left: number;
  top: number;
  right: number;
  bottom: number;
}) {
  return (box.right - box.left) * (box.bottom - box.top);
}
