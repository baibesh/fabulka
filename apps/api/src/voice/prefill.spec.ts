import { VoicePrefillSchema, type TemplateQuestion } from '@fabulka/shared';
import { WindowLimiter } from '../common/limiter';
import { MockGateway, MOCK_TRANSCRIPT } from '../meta/mock.gateway';
import { prefillPrompt } from '../meta/prompts';
import { sanitizePrefill } from './prefill';
import { wavSeconds } from './wav';

const questions: TemplateQuestion[] = [
  { key: 'toy', label: 'Какую игрушку возьмёт?', kind: 'text', required: true },
  {
    key: 'goodbye',
    label: 'Как вы прощаетесь утром?',
    kind: 'choice',
    options: ['обнимаемся', 'машем в окно'],
    required: true,
  },
];

describe('sanitizePrefill', () => {
  it('keeps valid fields and drops invalid ones one by one', () => {
    const fields = sanitizePrefill({
      child: {
        name: ' Алия ',
        age: 'пять',
        gender: 'daughter',
        interests: ['динозавры', '', 42, 'рисование'],
        pet: null,
        city: 'Алматы',
      },
      toyName: 'x'.repeat(41),
      theme: 'про зубного врача',
    });
    expect(fields).toEqual({
      child: {
        name: 'Алия',
        interests: ['динозавры', 'рисование'],
        city: 'Алматы',
      },
    });
  });

  it('coerces a numeric age and refuses one outside 2..10', () => {
    expect(sanitizePrefill({ child: { age: '5' } }).child.age).toBe(5);
    expect(sanitizePrefill({ child: { age: 14 } }).child).toEqual({});
  });

  it('keeps the theme only for a book of your own', () => {
    const raw = { theme: 'первый день в детском саду' };
    expect(sanitizePrefill(raw, [], true).theme).toBe(raw.theme);
    expect(sanitizePrefill(raw).theme).toBeUndefined();
  });

  it('restricts answers to known questions and choice answers to the options', () => {
    const fields = sanitizePrefill(
      {
        answers: {
          toy: 'плюшевый зайка',
          goodbye: 'Машем в окно',
          unknown: 'что-то',
        },
      },
      questions,
    );
    expect(fields.answers).toEqual({
      toy: 'плюшевый зайка',
      goodbye: 'машем в окно',
    });
    expect(
      sanitizePrefill({ answers: { goodbye: 'целуем' } }, questions).answers,
    ).toBeUndefined();
  });

  it('survives output that is not an object', () => {
    expect(sanitizePrefill('nope')).toEqual({ child: {} });
    expect(sanitizePrefill({ child: [], answers: 'x' }, questions)).toEqual({
      child: {},
    });
  });
});

describe('MockGateway voice', () => {
  const gateway = new MockGateway(0);

  it('hears the same Russian sentence every time', async () => {
    expect((await gateway.transcribe()).text).toBe(MOCK_TRANSCRIPT);
  });

  it('fills in the child, a theme without a template and first options with one', async () => {
    const own = await gateway.extractPrefill({
      transcript: MOCK_TRANSCRIPT,
      language: 'ru',
      theme: true,
    });
    expect(own.fields.child.name).toBe('Алия');
    expect(own.fields.theme).toBeTruthy();
    expect(own.fields.answers).toBeUndefined();

    const catalog = await gateway.extractPrefill({
      transcript: MOCK_TRANSCRIPT,
      language: 'ru',
      questions,
      theme: false,
    });
    expect(catalog.fields.theme).toBeUndefined();
    expect(catalog.fields.answers).toEqual({ goodbye: 'обнимаемся' });
    expect(
      VoicePrefillSchema.parse({ transcript: '', ...catalog.fields }),
    ).toBeTruthy();
  });
});

describe('prefillPrompt', () => {
  it('lists the question keys with their exact options', () => {
    const prompt = prefillPrompt({
      transcript: 'зовут Алия',
      language: 'ru',
      questions,
      theme: false,
    });
    expect(prompt).toContain('"goodbye"');
    expect(prompt).toContain('"обнимаемся", "машем в окно"');
    expect(prompt).toContain('Leave out "theme"');
    expect(prompt).toContain('"зовут Алия"');
  });
});

describe('WindowLimiter', () => {
  it('allows the limit per key within an hour, then again an hour later', () => {
    let now = 0;
    const limiter = new WindowLimiter(2, 60 * 60 * 1000, () => now);
    expect(limiter.take('a')).toBe(true);
    expect(limiter.take('a')).toBe(true);
    expect(limiter.take('a')).toBe(false);
    expect(limiter.take('b')).toBe(true);
    now = 60 * 60 * 1000;
    expect(limiter.take('a')).toBe(true);
  });
});

describe('wavSeconds', () => {
  /** A canonical 16 kHz 16-bit mono WAV header followed by `bytes` of samples. */
  function wav(bytes: number, extra = Buffer.alloc(0)): Buffer {
    const header = Buffer.alloc(36);
    header.write('RIFF', 0, 'ascii');
    header.writeUInt32LE(28 + extra.length + bytes, 4);
    header.write('WAVE', 8, 'ascii');
    header.write('fmt ', 12, 'ascii');
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(16_000, 24);
    header.writeUInt32LE(32_000, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    const data = Buffer.alloc(8);
    data.write('data', 0, 'ascii');
    data.writeUInt32LE(bytes, 4);
    return Buffer.concat([header, extra, data, Buffer.alloc(bytes)]);
  }

  it('reads the length from the byte rate and the data size', () => {
    expect(wavSeconds(wav(64_000))).toBe(2);
  });

  it('skips chunks it does not know', () => {
    const list = Buffer.alloc(12);
    list.write('LIST', 0, 'ascii');
    list.writeUInt32LE(4, 4);
    expect(wavSeconds(wav(32_000, list))).toBe(1);
  });

  it('refuses something that is not a WAV file', () => {
    expect(wavSeconds(Buffer.from('not a wav file at all'))).toBeNull();
  });
});
