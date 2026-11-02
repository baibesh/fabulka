import {
  isMissingReference,
  isSafetyRefusal,
  MetaGateway,
} from './meta.gateway';
import { softenScene } from './prompts';

const OPTIONS = {
  apiKey: 'test',
  baseURL: 'http://localhost:1',
  storyModel: 'muse-spark-1.3',
  imageModel: 'muse-image-1.0',
  samModel: 'sam-3.1',
};

/** The SDK's error for a 400: a status and Meta's message. */
const apiError = (status: number, message: string) =>
  Object.assign(new Error(message), { status });

const missing = () =>
  apiError(400, '400 referenced response not found or expired');

/** Muse Image's 400 for a prompt its safety filter refused, word for word. */
const refused = () =>
  apiError(
    400,
    '400 The response was filtered due to the prompt triggering our content management policy.',
  );

const picture = (id: string) => ({
  id,
  status: 'completed',
  output: [
    {
      type: 'image_generation_call',
      result: Buffer.from('jpeg').toString('base64'),
    },
  ],
});

/** A gateway whose Meta API is `create`, with no pause between tries. */
function gatewayWith(create: jest.Mock) {
  const gateway = new MetaGateway(OPTIONS, undefined, 0);
  (gateway as unknown as { client: unknown }).client = {
    responses: { create },
  };
  return gateway;
}

describe('MetaGateway pictures drawn after an earlier one', () => {
  it('asks again when Meta has not stored the earlier picture yet', async () => {
    const create = jest
      .fn()
      .mockRejectedValueOnce(missing())
      .mockResolvedValueOnce(picture('pet-1'));

    const pet = await gatewayWith(create).drawPet('a white cat', 'hero-1');

    expect(pet.ref).toBe('pet-1');
    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenLastCalledWith(
      expect.objectContaining({ previous_response_id: 'hero-1' }),
    );
  });

  it('gives up after three tries', async () => {
    const create = jest.fn().mockRejectedValue(missing());

    await expect(
      gatewayWith(create).drawPage('a scene', 'hero-1', {
        pet: false,
        toy: false,
      }),
    ).rejects.toThrow('referenced response');
    expect(create).toHaveBeenCalledTimes(3);
  });

  it('does not ask again for other errors', async () => {
    const create = jest
      .fn()
      .mockRejectedValue(apiError(400, '400 prompt refused'));

    await expect(
      gatewayWith(create).drawPet('a white cat', 'hero-1'),
    ).rejects.toThrow('prompt refused');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('tells the missing-reference 400 from the rest', () => {
    expect(isMissingReference(missing())).toBe(true);
    expect(
      isMissingReference(apiError(500, 'referenced response not found')),
    ).toBe(false);
    expect(isMissingReference(apiError(400, 'invalid size'))).toBe(false);
    expect(isMissingReference(new Error('referenced response expired'))).toBe(
      false,
    );
  });
});

describe('MetaGateway pages the safety filter refused', () => {
  const ANGRY =
    'close-up of the hero hugging the toy tightly, showing hot red cheeks and clenched fists, a grey storm cloud growing over her chest';

  /** The text the image model was asked to draw in call `n` (0-based). */
  const prompt = (create: jest.Mock, n: number) =>
    (create.mock.calls as [{ input: string }][])[n][0].input;

  it('draws the page once more in a gentler form', async () => {
    const create = jest
      .fn()
      .mockRejectedValueOnce(refused())
      .mockResolvedValueOnce(picture('page-1'));

    const page = await gatewayWith(create).drawPage(ANGRY, 'toy-1', {
      pet: false,
      toy: true,
    });

    expect(page.ref).toBe('page-1');
    expect(create).toHaveBeenCalledTimes(2);
    expect(prompt(create, 0)).toContain('clenched fists');
    expect(prompt(create, 1)).not.toMatch(/close-up|clenched|red cheeks/);
    expect(prompt(create, 1)).toContain('a grey storm cloud');
    expect(prompt(create, 1)).toContain(
      'The toy is the same toy as in the toy character sheet',
    );
    expect(create).toHaveBeenLastCalledWith(
      expect.objectContaining({ previous_response_id: 'toy-1' }),
    );
  });

  it('gives up when the gentler page is refused too', async () => {
    const create = jest.fn().mockRejectedValue(refused());

    await expect(
      gatewayWith(create).drawPage(ANGRY, 'hero-1', { pet: false, toy: false }),
    ).rejects.toThrow('content management policy');
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('does not soften character sheets', async () => {
    const create = jest.fn().mockRejectedValue(refused());

    await expect(
      gatewayWith(create).drawPet('a white cat', 'hero-1'),
    ).rejects.toThrow('content management policy');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('tells the safety refusal from other errors', () => {
    expect(isSafetyRefusal(refused())).toBe(true);
    expect(isSafetyRefusal(missing())).toBe(false);
    expect(isSafetyRefusal(apiError(500, 'content management policy'))).toBe(
      false,
    );
  });
});

describe('softenScene', () => {
  it('shows the feeling in the posture of a wider shot', () => {
    const soft = softenScene(
      'Close-up of the hero standing with clenched fists and a hot red face, tears streaming down her cheeks, the pet watching.',
    );

    expect(soft).not.toMatch(/close-up|clenched|fists|red face|tears/i);
    expect(soft).toContain('the pet watching');
    expect(soft).toContain("the hero's whole body is in the picture");
    expect(soft).not.toMatch(/\.\./);
  });

  it('keeps the child in a bath under the foam', () => {
    const soft = softenScene(
      'The hero sitting in warm water in a white bathtub, a small yellow rubber duck floating next to her.',
    );

    expect(soft).toContain('a small yellow rubber duck');
    expect(soft).toContain('thick white foam up to the shoulders');
    expect(softenScene('The hero dries off in the bathroom')).not.toContain(
      'foam',
    );
  });
});
