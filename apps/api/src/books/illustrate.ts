import { Logger } from '@nestjs/common';
import type { ArtOutcome, Language } from '@fabulka/shared';
import type {
  FrameRequest,
  GeneratedImage,
  ModelGateway,
} from '../meta/model-gateway';
import type { Companions } from '../meta/prompts';
import { softenScene } from '../meta/prompts';
import { isSafetyRefusal } from '../meta/refusal';

export type { ArtOutcome } from '@fabulka/shared';

export interface Illustration {
  /** Null when every version of the scene was refused. */
  image: GeneratedImage | null;
  outcome: ArtOutcome;
  /** Everything the frame cost: the pictures and the rewrite (a refused picture costs nothing). */
  costUsd: number;
}

/**
 * What drawing one frame needs besides the gateway (a picture book page is one frame): the frame's
 * request with its first scene, and what the refusal ladder needs to try again.
 */
export interface FrameToIllustrate extends Omit<FrameRequest, 'companions'> {
  page: number;
  frame: number;
  /** The frame's texts (the page's text for a picture book page), in the book's language: the beat a rewrite keeps. */
  text: string;
  language: Language;
  /** Which companions a scene shows: asked again for the softened and the rewritten scene. */
  companions: (scene: string) => Companions;
  /**
   * Called before the picture is drawn again after a refusal (the gentler scene, then the
   * rewritten one), so the progress screen can say the page is being redrawn. A throw stops it.
   */
  onRetry?: (next: 'softened' | 'rewritten') => unknown;
  /** Runs each model call inside the frame's journal step ("frame.draw", "frame.rewrite"). */
  step?: <T>(
    id: 'frame.draw' | 'frame.rewrite',
    task: () => Promise<T>,
  ) => Promise<T>;
}

const logger = new Logger('illustrateFrame');

/**
 * One frame's picture, so that a scene the safety filter refuses never fails the whole book:
 * 1. the scene as the story wrote it;
 * 2. refused: the same scene in a gentler form (softenScene: a wider shot, a wobble for a fall);
 * 3. refused again: Muse Spark rewrites the scene from the frame's text and the refusal (the same
 *    beat, characters and place, in a calm safe pose), and it is drawn once more;
 * 4. refused again, or the rewrite failed: no picture - a picture book page is laid out as a
 *    vignette page, a panel shows the hero's sheet small on paper.
 * Any other error (the network, a 5xx) is thrown as before. Every call is in the journal.
 */
export async function illustrateFrame(
  models: ModelGateway,
  frame: FrameToIllustrate,
): Promise<Illustration> {
  const step =
    frame.step ??
    (<T>(_id: string, task: () => Promise<T>): Promise<T> => task());
  const draw = (scene: string) =>
    step('frame.draw', () =>
      models.drawFrame({
        ...frame,
        scene,
        companions: frame.companions(scene),
      }),
    );
  let costUsd = 0;
  const drawn = (image: GeneratedImage, outcome: ArtOutcome) => ({
    image,
    outcome,
    costUsd: costUsd + image.costUsd,
  });
  const where =
    frame.frame > 1
      ? `page ${frame.page} frame ${frame.frame}`
      : `page ${frame.page}`;

  let refusal: unknown;
  try {
    return drawn(await draw(frame.scene), 'drawn');
  } catch (error) {
    if (!isSafetyRefusal(error)) throw error;
    refusal = error;
  }
  await frame.onRetry?.('softened');
  try {
    return drawn(await draw(softenScene(frame.scene)), 'softened');
  } catch (error) {
    if (!isSafetyRefusal(error)) throw error;
    refusal = error;
  }

  await frame.onRetry?.('rewritten');
  let scene: string;
  try {
    const rewritten = await step('frame.rewrite', () =>
      models.rewriteScene({
        scene: frame.scene,
        text: frame.text,
        language: frame.language,
        refusal: refusal instanceof Error ? refusal.message : String(refusal),
      }),
    );
    costUsd += rewritten.costUsd;
    scene = rewritten.scene;
  } catch (error) {
    logger.warn(
      `${where}: no rewritten scene (${error instanceof Error ? error.message : String(error)}); laid out without its picture`,
    );
    return { image: null, outcome: 'refused', costUsd };
  }
  try {
    return drawn(await draw(scene), 'rewritten');
  } catch (error) {
    if (!isSafetyRefusal(error)) throw error;
  }
  logger.warn(
    `${where}: every version of the scene was refused; laid out without its picture`,
  );
  return { image: null, outcome: 'refused', costUsd };
}
