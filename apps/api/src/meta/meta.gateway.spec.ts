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
  it('draws a page once and leaves a refusal to the caller (illustratePage)', async () => {
    const create = jest.fn().mockRejectedValue(refused());

    await expect(
      gatewayWith(create).drawPage('a scene', 'hero-1', {
        pet: false,
        toy: false,
      }),
    ).rejects.toThrow('content management policy');
    expect(create).toHaveBeenCalledTimes(1);
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

  it('has Muse Spark rewrite a refused scene from the page text and the refusal', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'r1',
      output_text: JSON.stringify({
        scene_prompt:
          'the hero standing on his skateboard at the top of a gentle slope in the park, smiling',
      }),
      usage: { input_tokens: 1000, output_tokens: 100 },
    });

    const rewritten = await gatewayWith(create).rewriteScene({
      scene: 'the hero tumbling off his skateboard in the park',
      text: 'Тимур упал со скейта, но тут же встал.',
      language: 'ru',
      refusal: refused().message,
    });

    expect(rewritten.scene).toContain('standing on his skateboard');
    expect(rewritten.costUsd).toBeCloseTo((1000 * 1.25 + 100 * 4.25) / 1e6);
    const request = (
      create.mock.calls as [{ input: string; instructions: string }][]
    )[0][0];
    expect(request.instructions).toContain('calm, safe pose');
    expect(request.input).toContain('content management policy');
    expect(request.input).toContain('Тимур упал со скейта');
    expect(request.input).toContain('tumbling off his skateboard');
    // The gentler form was refused too, and the model is told so.
    expect(request.input).toContain('wobbling on his skateboard');
  });

  it('throws when Muse Spark returns no scene', async () => {
    const create = jest
      .fn()
      .mockResolvedValue({ id: 'r2', output_text: '{"scene":""}' });

    await expect(
      gatewayWith(create).rewriteScene({
        scene: 'a scene',
        text: 'text',
        language: 'en',
        refusal: 'refused',
      }),
    ).rejects.toThrow('no rewritten scene');
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

  it('turns a fall into a wobble, a crash into a near miss and leaves injuries out', () => {
    const skate = softenScene(
      'The hero tumbling off his skateboard in the park, the pet running behind.',
    );
    expect(skate).not.toMatch(/tumbl|fall/i);
    expect(skate).toContain('wobbling on his skateboard in the park');
    expect(skate).toContain('the pet running behind');
    expect(skate).toContain('everyone is safe and well');

    const trip = softenScene(
      'The hero trips over a tree root and scrapes her knee, crying in pain.',
    );
    expect(trip).not.toMatch(/trips|scrape|crying|pain/i);
    expect(trip).toContain('a tree root');

    const bike = softenScene(
      'The hero crashes his bike into a fence and falls down the hill, blood on his nose.',
    );
    expect(bike).not.toMatch(/crash|falls|blood/i);
    expect(bike).toContain('just past a fence');

    expect(softenScene('The hero falls into the pond')).toContain(
      'splashing safely into the pond',
    );
    expect(softenScene('The hero gets hurt on the slide')).not.toMatch(/hurt/);
    expect(softenScene('The hero slips.')).not.toMatch(/slips|,\./);
  });

  it('leaves falling snow and falling asleep alone', () => {
    const calm = softenScene(
      'The hero falls asleep by the window while snow falls outside.',
    );
    expect(calm).toContain('falls asleep by the window while snow falls');
    expect(calm).not.toContain('everyone is safe and well');
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
