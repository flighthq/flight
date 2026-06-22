import { createSharpenFilter } from './sharpenFilter';

describe('createSharpenFilter', () => {
  it('sets type to sharpen', () => {
    expect(createSharpenFilter().kind).toBe('SharpenFilter');
  });

  it('spreads provided options', () => {
    const f = createSharpenFilter({ amount: 1.5, blurX: 3 });
    expect(f.amount).toBe(1.5);
    expect(f.blurX).toBe(3);
  });
});
