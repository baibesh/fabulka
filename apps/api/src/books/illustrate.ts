import { Logger } from '@nestjs/common';
import type { Language } from '@fabulka/shared';
import type { GeneratedImage, ModelGateway } from '../meta/model-gateway';
import type { Companions, TextSpace } from '../meta/prompts';
import { softenScene } from '../meta/prompts';
import { isSafetyRefusal } from '../meta/refusal';

/**
 * How a page's picture was drawn: as the story wrote the scene, in its gentler form (softenScene),
 * rewritten by Muse Spark, or not at all — every version was refused, so the page is laid out
 * without a picture of its own (a vignette page, see PageLayout.noArt).
 */
export type ArtOutcome = 'drawn' | 'softened' | 'rewritten' | 'refused';

export interface Illustration {
  /** Null when every version of the scene was refused. */
  image: GeneratedImage | null;
  outcome: ArtOutcome;
  /** Everything the page cost: the pictures and the rewrite (a refused picture costs nothing). */
  costUsd: number;
}

/** What drawing one page needs besides the gateway. */
export interface PageToIllustrate {
  page: number;
  text: string;
  scenePrompt: string;
  language: Language;
  anchorRef: string;
  /** Which companions a scene shows: asked again for the softened and the rewritten scene. */
  companions: (scene: string) => Companions;
  style?: string;
  textSpace?: TextSpace;
}

const logger = new Logger('illustratePage');

/**
 * One page's picture, so that a scene the safety filter refuses never fails the whole book:
 * 1. the scene as the story wrote it;
 * 2. refused: the same scene in a gentler form (softenScene: a wider shot, a wobble for a fall);
 * 3. refused again: Muse Spark rewrites the scene from the page text and the refusal (the same
 *    beat, characters and place, in a calm safe pose), and it is drawn once more;
 * 4. refused again, or the rewrite failed: no picture — the page is laid out as a vignette page.
 * Any other error (the network, a 5xx) is thrown as before. Every call is in the journal.
 */
export async function illustratePage(
  models: ModelGateway,
  page: PageToIllustrate,
): Promise<Illustration> {
  const draw = (scene: string) =>
    models.drawPage(
      scene,
      page.anchorRef,
      page.companions(scene),
      page.style,
      page.textSpace,
    );
  let costUsd = 0;
  const drawn = (image: GeneratedImage, outcome: ArtOutcome) => ({
    image,
    outcome,
    costUsd: costUsd + image.costUsd,
  });

  let refusal: unknown;
  try {
    return drawn(await draw(page.scenePrompt), 'drawn');
  } catch (error) {
    if (!isSafetyRefusal(error)) throw error;
    refusal = error;
  }
  try {
    return drawn(await draw(softenScene(page.scenePrompt)), 'softened');
  } catch (error) {
    if (!isSafetyRefusal(error)) throw error;
    refusal = error;
  }

  let scene: string;
  try {
    const rewritten = await models.rewriteScene({
      scene: page.scenePrompt,
      text: page.text,
      language: page.language,
      refusal: refusal instanceof Error ? refusal.message : String(refusal),
    });
    costUsd += rewritten.costUsd;
    scene = rewritten.scene;
  } catch (error) {
    logger.warn(
      `page ${page.page}: no rewritten scene (${error instanceof Error ? error.message : String(error)}); laid out without its picture`,
    );
    return { image: null, outcome: 'refused', costUsd };
  }
  try {
    return drawn(await draw(scene), 'rewritten');
  } catch (error) {
    if (!isSafetyRefusal(error)) throw error;
  }
  logger.warn(
    `page ${page.page}: every version of the scene was refused; laid out without its picture`,
  );
  return { image: null, outcome: 'refused', costUsd };
}
