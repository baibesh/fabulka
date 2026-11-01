import type {
  Language,
  PageSubject,
  Story,
  VoicePrefill,
} from '@fabulka/shared';
import type {
  Companions,
  PrefillBrief,
  StoryBrief,
  TextSpace,
} from './prompts';

export const MODEL_GATEWAY = Symbol('MODEL_GATEWAY');

export interface GeneratedImage {
  data: Buffer;
  ext: 'png' | 'webp' | 'jpeg' | 'svg';
  /** Response id that later generations chain from (previous_response_id). */
  ref: string;
  costUsd: number;
}

/** The form fields a voice recording filled in, everything but the transcript. */
export type PrefillFields = Omit<VoicePrefill, 'transcript'>;

export interface GeneratedStory {
  story: Story;
  costUsd: number;
}

/**
 * Everything Fabulka asks of Meta's models. The real implementation calls the
 * Meta Model API; the mock one returns canned output so tests and CI cost nothing.
 */
export interface ModelGateway {
  writeStory(brief: StoryBrief): Promise<GeneratedStory>;
  /** Muse Spark reads the finished story as a children's content reviewer before anything is drawn. */
  reviewStory(
    story: Story,
    age: number,
    language: Language,
  ): Promise<{ safe: boolean; reason: string; costUsd: number }>;
  /**
   * Finds the toy in the parent's photo with SAM and cuts it out on white. `cutout` is null when
   * nothing was found; the caller then works from the whole photo.
   */
  findToy(photo: Buffer): Promise<{ cutout: Buffer | null; costUsd: number }>;
  /** Muse Spark looks at the toy and describes it in one sentence for the illustrator. */
  describeToy(image: Buffer): Promise<{ description: string; costUsd: number }>;
  /** The toy's character sheet, drawn from the photo as a reference and chained to the others. */
  drawToy(
    toyDescription: string,
    reference: Buffer,
    anchorRef: string,
    style?: string,
  ): Promise<GeneratedImage>;
  /** The hero character sheet every page is anchored on. */
  drawHero(heroDescription: string, style?: string): Promise<GeneratedImage>;
  /** The pet character sheet, chained from the hero sheet so both stay in the conversation. */
  drawPet(
    petDescription: string,
    heroRef: string,
    style?: string,
  ): Promise<GeneratedImage>;
  /**
   * One page illustration, chained from the last character sheet (`anchorRef`) so the
   * child, the pet and the toy stay on-model. `style` replaces the default art style (catalog books).
   */
  drawPage(
    scenePrompt: string,
    anchorRef: string,
    companions: Companions,
    style?: string,
    textSpace?: TextSpace,
  ): Promise<GeneratedImage>;
  /**
   * SAM finds the hero in a page illustration, once per page: a coarse mask the page layout keeps
   * text off. Throws when SAM fails; a picture with nobody in it gives an empty mask.
   */
  findSubject(
    image: Buffer,
    ext: GeneratedImage['ext'],
  ): Promise<{ subject: PageSubject; costUsd: number }>;
  /** Muse Voice Transcribe: the parent's recording (a 16 kHz mono WAV) as text. Nothing is kept. */
  transcribe(
    wav: Buffer,
    language: Language,
  ): Promise<{ text: string; costUsd: number }>;
  /**
   * Muse Spark reads the transcript and fills in the order form. Invalid or guessed fields are left
   * out rather than failing the call.
   */
  extractPrefill(
    brief: PrefillBrief,
  ): Promise<{ fields: PrefillFields; costUsd: number }>;
}
