import { MockGateway, mockRefusal } from '../meta/mock.gateway';
import type { GeneratedImage, ModelGateway } from '../meta/model-gateway';
import { DEFAULT_STORY_FORMATS, storedPageFrom } from '@fabulka/shared';
import { illustrateFrame, type FrameToIllustrate } from './illustrate';
import { petInScene } from './books.service';

const picture = (ref: string): GeneratedImage => ({
  data: Buffer.from('jpeg'),
  ext: 'jpeg',
  ref,
  costUsd: 0.01,
});

const PAGE: FrameToIllustrate = {
  page: 3,
  frame: 1,
  text: 'Тимур упал со скейта, но тут же встал и засмеялся.',
  scene: 'the hero tumbling off his skateboard in the park, the pet barking',
  language: 'ru',
  anchorRef: 'pet-1',
  companions: (scene) => ({ pet: petInScene(scene), toy: false }),
  cast: [],
  size: '1536x1024',
};

/** A gateway whose drawFrame answers in turn, and whose Muse Spark rewrites to `rewritten`. */
function gateway(
  draws: (GeneratedImage | Error)[],
  rewrite: () => Promise<{ scene: string; costUsd: number }> = () =>
    Promise.resolve({
      scene:
        'the hero standing on his skateboard at the top of a gentle slope, smiling',
      costUsd: 0.002,
    }),
) {
  const drawPage = jest.fn((frame: unknown): Promise<GeneratedImage> => {
    void frame;
    const next = draws.shift();
    if (!next) throw new Error('no more draws');
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  const rewriteScene = jest.fn(rewrite);
  const models = {
    drawFrame: drawPage,
    rewriteScene,
  } as unknown as ModelGateway;
  return { models, drawPage, rewriteScene };
}

/** The scene drawFrame was asked for in call `n` (0-based). */
const scene = (mock: jest.Mock, n: number) =>
  ((mock.mock.calls as unknown[][])[n][0] as { scene: string }).scene;

describe('illustrateFrame', () => {
  it('draws the scene as written when nothing is refused', async () => {
    const { models, drawPage, rewriteScene } = gateway([picture('p1')]);
    const done = await illustrateFrame(models, PAGE);
    expect(done).toMatchObject({ outcome: 'drawn', costUsd: 0.01 });
    expect(done.image?.ref).toBe('p1');
    expect(drawPage).toHaveBeenCalledWith({
      ...PAGE,
      scene: PAGE.scene,
      companions: { pet: true, toy: false },
    });
    expect(rewriteScene).not.toHaveBeenCalled();
  });

  it('draws a refused scene once more in its gentler form', async () => {
    const { models, drawPage } = gateway([mockRefusal(), picture('p2')]);
    const done = await illustrateFrame(models, PAGE);
    expect(done.outcome).toBe('softened');
    expect(scene(drawPage, 1)).toContain('wobbling on his skateboard');
    expect(scene(drawPage, 1)).not.toMatch(/tumbl/);
  });

  it('refused, softened, refused: Muse Spark rewrites the scene and it is drawn', async () => {
    const { models, drawPage, rewriteScene } = gateway([
      mockRefusal(),
      mockRefusal(),
      picture('p3'),
    ]);
    const done = await illustrateFrame(models, PAGE);
    expect(done.outcome).toBe('rewritten');
    expect(done.image?.ref).toBe('p3');
    // The picture and the rewrite; refused pictures cost nothing.
    expect(done.costUsd).toBeCloseTo(0.012);
    expect(rewriteScene).toHaveBeenCalledWith({
      scene: PAGE.scene,
      text: PAGE.text,
      language: 'ru',
      refusal: expect.stringContaining('content management policy') as unknown,
    });
    expect(drawPage).toHaveBeenCalledTimes(3);
    expect(scene(drawPage, 2)).toContain('top of a gentle slope');
    // The rewritten scene has no pet in it: its sheet is not pointed at.
    expect(
      ((drawPage.mock.calls as unknown[][])[2][0] as { companions: unknown })
        .companions,
    ).toEqual({ pet: false, toy: false });
  });

  it('refused every time: no picture, and the book goes on', async () => {
    const { models, drawPage } = gateway([
      mockRefusal(),
      mockRefusal(),
      mockRefusal(),
    ]);
    const done = await illustrateFrame(models, PAGE);
    expect(done).toEqual({ image: null, outcome: 'refused', costUsd: 0.002 });
    expect(drawPage).toHaveBeenCalledTimes(3);
  });

  it('a failed rewrite leaves the page without its picture too', async () => {
    const { models, drawPage } = gateway([mockRefusal(), mockRefusal()], () =>
      Promise.reject(new Error('Muse Spark returned no rewritten scene')),
    );
    const done = await illustrateFrame(models, PAGE);
    expect(done).toEqual({ image: null, outcome: 'refused', costUsd: 0 });
    expect(drawPage).toHaveBeenCalledTimes(2);
  });

  it('says when the page is drawn again, so the progress screen can show it', async () => {
    const { models } = gateway([mockRefusal(), mockRefusal(), picture('p3')]);
    const onRetry = jest.fn();
    const done = await illustrateFrame(models, { ...PAGE, onRetry });
    expect(done.outcome).toBe('rewritten');
    expect(onRetry.mock.calls).toEqual([['softened'], ['rewritten']]);
    const first = gateway([picture('p1')]);
    await illustrateFrame(first.models, {
      ...PAGE,
      onRetry: (onRetry.mockClear(), onRetry),
    });
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('passes on errors that are not refusals', async () => {
    const outage = Object.assign(new Error('503 unavailable'), { status: 503 });
    const { models, rewriteScene } = gateway([mockRefusal(), outage]);
    await expect(illustrateFrame(models, PAGE)).rejects.toThrow('503');
    expect(rewriteScene).not.toHaveBeenCalled();
  });

  it("the mock model refuses the 'mock-refuse' page in every version", async () => {
    const models = new MockGateway(0);
    const { story } = await models.writeStory({
      child: {
        name: 'Тимур',
        age: 11,
        gender: 'boy',
        interests: ['скейт', 'mock-refuse'],
        city: 'Алматы',
        language: 'ru',
      },
      pageCount: 3,
      methodology: {
        slug: 'adventure-quest',
        source: 's',
        structure: ['beat'],
        rules: [],
        avoid: [],
      },
      format: DEFAULT_STORY_FORMATS[0],
    });
    const pages = await Promise.all(
      story.pages.map((p) => {
        const page = storedPageFrom(p, DEFAULT_STORY_FORMATS[0], null);
        return illustrateFrame(models, {
          ...PAGE,
          page: page.page,
          text: page.texts[0].text,
          scene: page.frames[0].scenePrompt,
        });
      }),
    );
    expect(pages.map((p) => p.outcome)).toEqual(['drawn', 'refused', 'drawn']);
  });
});
