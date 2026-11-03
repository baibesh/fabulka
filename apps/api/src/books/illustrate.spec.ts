import { MockGateway, mockRefusal } from '../meta/mock.gateway';
import type { GeneratedImage, ModelGateway } from '../meta/model-gateway';
import { illustratePage, type PageToIllustrate } from './illustrate';
import { petInScene } from './books.service';

const picture = (ref: string): GeneratedImage => ({
  data: Buffer.from('jpeg'),
  ext: 'jpeg',
  ref,
  costUsd: 0.01,
});

const PAGE: PageToIllustrate = {
  page: 3,
  text: 'Тимур упал со скейта, но тут же встал и засмеялся.',
  scenePrompt:
    'the hero tumbling off his skateboard in the park, the pet barking',
  language: 'ru',
  anchorRef: 'pet-1',
  companions: (scene) => ({ pet: petInScene(scene), toy: false }),
};

/** A gateway whose drawPage answers in turn, and whose Muse Spark rewrites to `rewritten`. */
function gateway(
  draws: (GeneratedImage | Error)[],
  rewrite: () => Promise<{ scene: string; costUsd: number }> = () =>
    Promise.resolve({
      scene:
        'the hero standing on his skateboard at the top of a gentle slope, smiling',
      costUsd: 0.002,
    }),
) {
  const drawPage = jest.fn((): Promise<GeneratedImage> => {
    const next = draws.shift();
    if (!next) throw new Error('no more draws');
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  const rewriteScene = jest.fn(rewrite);
  const models = { drawPage, rewriteScene } as unknown as ModelGateway;
  return { models, drawPage, rewriteScene };
}

/** The scene drawPage was asked for in call `n` (0-based). */
const scene = (mock: jest.Mock, n: number) =>
  (mock.mock.calls as unknown[][])[n][0] as string;

describe('illustratePage', () => {
  it('draws the scene as written when nothing is refused', async () => {
    const { models, drawPage, rewriteScene } = gateway([picture('p1')]);
    const done = await illustratePage(models, PAGE);
    expect(done).toMatchObject({ outcome: 'drawn', costUsd: 0.01 });
    expect(done.image?.ref).toBe('p1');
    expect(drawPage).toHaveBeenCalledWith(
      PAGE.scenePrompt,
      'pet-1',
      { pet: true, toy: false },
      undefined,
      undefined,
    );
    expect(rewriteScene).not.toHaveBeenCalled();
  });

  it('draws a refused scene once more in its gentler form', async () => {
    const { models, drawPage } = gateway([mockRefusal(), picture('p2')]);
    const done = await illustratePage(models, PAGE);
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
    const done = await illustratePage(models, PAGE);
    expect(done.outcome).toBe('rewritten');
    expect(done.image?.ref).toBe('p3');
    // The picture and the rewrite; refused pictures cost nothing.
    expect(done.costUsd).toBeCloseTo(0.012);
    expect(rewriteScene).toHaveBeenCalledWith({
      scene: PAGE.scenePrompt,
      text: PAGE.text,
      language: 'ru',
      refusal: expect.stringContaining('content management policy') as unknown,
    });
    expect(drawPage).toHaveBeenCalledTimes(3);
    expect(scene(drawPage, 2)).toContain('top of a gentle slope');
    // The rewritten scene has no pet in it: its sheet is not pointed at.
    expect((drawPage.mock.calls as unknown[][])[2][2]).toEqual({
      pet: false,
      toy: false,
    });
  });

  it('refused every time: no picture, and the book goes on', async () => {
    const { models, drawPage } = gateway([
      mockRefusal(),
      mockRefusal(),
      mockRefusal(),
    ]);
    const done = await illustratePage(models, PAGE);
    expect(done).toEqual({ image: null, outcome: 'refused', costUsd: 0.002 });
    expect(drawPage).toHaveBeenCalledTimes(3);
  });

  it('a failed rewrite leaves the page without its picture too', async () => {
    const { models, drawPage } = gateway([mockRefusal(), mockRefusal()], () =>
      Promise.reject(new Error('Muse Spark returned no rewritten scene')),
    );
    const done = await illustratePage(models, PAGE);
    expect(done).toEqual({ image: null, outcome: 'refused', costUsd: 0 });
    expect(drawPage).toHaveBeenCalledTimes(2);
  });

  it('passes on errors that are not refusals', async () => {
    const outage = Object.assign(new Error('503 unavailable'), { status: 503 });
    const { models, rewriteScene } = gateway([mockRefusal(), outage]);
    await expect(illustratePage(models, PAGE)).rejects.toThrow('503');
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
    });
    const pages = await Promise.all(
      story.pages.map((p) =>
        illustratePage(models, {
          ...PAGE,
          page: p.page,
          text: p.text,
          scenePrompt: p.scene_prompt,
        }),
      ),
    );
    expect(pages.map((p) => p.outcome)).toEqual(['drawn', 'refused', 'drawn']);
  });
});
