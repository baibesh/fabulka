import type {
  ChildLook,
  Language,
  ModelCallKind,
  PageSubject,
  ProposedTheme,
  ReferenceKind,
  SamConcept,
  Story,
  VoicePrefill,
} from '@fabulka/shared';
import type { BookTranslation } from '../examples/translation';
import type {
  Companions,
  FrameBrief,
  PrefillBrief,
  SceneRewriteBrief,
  ShortenBrief,
  StoryBrief,
  TranslationBrief,
} from './prompts';

export const MODEL_GATEWAY = Symbol('MODEL_GATEWAY');

export interface GeneratedImage {
  data: Buffer;
  ext: 'png' | 'webp' | 'jpeg' | 'svg';
  /** Response id that later generations chain from (previous_response_id). */
  ref: string;
  costUsd: number;
}

/**
 * An illustrator's reference picture sent with an image call (selectReferences picks them): its id
 * for the journal, its kind for the prompt's note, and the small copy made for the model.
 */
export interface ReferenceImage {
  id: string;
  kind: ReferenceKind;
  data: Buffer;
}

/** The form fields a voice recording filled in, everything but the transcript. */
export type PrefillFields = Omit<VoicePrefill, 'transcript'>;

export interface GeneratedStory {
  story: Story;
  costUsd: number;
}

/** One frame's picture to draw: the brief and the illustrators' pictures sent with it. */
export interface FrameRequest extends FrameBrief {
  references?: ReferenceImage[];
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
  /**
   * Muse Spark describes the child's look from the parent's photo (the photo path, with consent):
   * only the closed values of ChildLook, never anything sensitive. Throws when the model refuses the
   * photo, finds no child or answers with nothing usable; the caller then draws from the description.
   */
  describeChild(photo: Buffer): Promise<{ look: ChildLook; costUsd: number }>;
  /**
   * The hero character sheet every page is anchored on. `references`: the illustrators' style
   * pictures and character guide, sent next to the prompt. `photo` (the photo path): the child's
   * photo, sent first as picture 1 so the hero looks like the child; `look` is what Muse Spark saw in
   * it. Only this call and describeChild ever get the photo; every later picture chains from the
   * drawn sheet.
   */
  drawHero(
    heroDescription: string,
    style?: string,
    references?: ReferenceImage[],
    photo?: { data: Buffer; look: string },
  ): Promise<GeneratedImage>;
  /** The pet character sheet, chained from the hero sheet so both stay in the conversation. */
  drawPet(
    petDescription: string,
    heroRef: string,
    style?: string,
  ): Promise<GeneratedImage>;
  /**
   * A side character's sheet (a format with cast sheets), chained from the last sheet so the hero,
   * the friends and the cast stay in one conversation; frames then chain from the last of them.
   */
  drawCast(
    name: string,
    look: string,
    anchorRef: string,
    style?: string,
  ): Promise<GeneratedImage>;
  /**
   * One frame's picture (a picture book page is one frame), chained from the last character sheet
   * (`anchorRef`) so the child, the pet, the toy and the cast stay on-model; the frames of a page
   * are drawn in parallel. One try: a scene the safety filter refuses throws (isSafetyRefusal), and
   * illustrateFrame takes it from there (a gentler scene, a rewritten one, then no picture).
   */
  drawFrame(frame: FrameRequest): Promise<GeneratedImage>;
  /**
   * The front cover's own illustration, chained from the last character sheet like a page: the hero
   * once, in a scene from the story, low in the picture with the top left calm for the lettering.
   * One try; a refusal throws (isSafetyRefusal) and the caller decides.
   */
  drawCover(
    coverScene: string,
    anchorRef: string,
    companions: Companions,
    style?: string,
    references?: ReferenceImage[],
  ): Promise<GeneratedImage>;
  /**
   * SAM finds the characters (people and animals) in a page illustration, once per page: a coarse
   * mask the page layout keeps text off. Throws when SAM fails; a picture with nobody in it gives an
   * empty mask.
   */
  findSubject(
    image: Buffer,
    ext: GeneratedImage['ext'],
    kind?: Extract<ModelCallKind, 'page-mask' | 'cover-mask'>,
    /** What to look for, one request each (the frame's text kinds decide); people and animals by default. */
    concepts?: readonly SamConcept[],
  ): Promise<{ subject: PageSubject; costUsd: number }>;
  /**
   * Muse Spark proposes a book theme for the owner's brief, as JSON (ProposedTheme in
   * @fabulka/shared); the caller validates it and checks it in code. With `current`, the brief is
   * the owner's comment on that theme ("warmer paper, bolder titles") and the answer is the theme
   * adjusted to it. Throws when the model returns no valid JSON after its retries.
   */
  proposeTheme(
    brief: string,
    current?: ProposedTheme,
  ): Promise<{ proposal: unknown; costUsd: number }>;
  /** Muse Image draws a theme's ornament: a small motif on a transparent (or white) background. */
  drawOrnament(prompt: string): Promise<GeneratedImage>;
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
  /**
   * Muse Spark translates a finished book (its title, pages, talk questions, dedication and photo
   * caption) and spells the child's name in the target script. Throws when the model returns no
   * valid translation after its retries.
   */
  translateBook(
    brief: TranslationBrief,
  ): Promise<{ translation: BookTranslation; costUsd: number }>;
  /**
   * Muse Spark rewrites the scene of a page Muse Image refused twice, keeping the story beat, the
   * characters and the place in a calm, safe pose. Throws when the model returns no scene.
   */
  rewriteScene(
    brief: SceneRewriteBrief,
  ): Promise<{ scene: string; costUsd: number }>;
  /** Muse Spark shortens one text that did not fit its box: a page's narration, a balloon, a caption. */
  shortenText(brief: ShortenBrief): Promise<{ text: string; costUsd: number }>;
}
