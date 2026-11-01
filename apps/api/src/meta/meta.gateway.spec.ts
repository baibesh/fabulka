import { isMissingReference, MetaGateway } from './meta.gateway';

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
