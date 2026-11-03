import { hyphenatorFor } from './hyphenate';

describe('hyphenatorFor', () => {
  it('keeps the line breaks of a page text', () => {
    const hyphenate = hyphenatorFor('ru')!;
    const text = 'Подсказка рассказчика.\n«Привет!» — сказала черепаха.';
    const out = hyphenate(text);
    expect(out.split('\n')).toHaveLength(2);
    expect(out.replace(/­/g, '')).toBe(text);
  });
});
