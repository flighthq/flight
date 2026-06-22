import { createBlurFilter } from './blurFilter';

describe('createBlurFilter', () => {
  it('sets type to blur', () => {
    expect(createBlurFilter().kind).toBe('BlurFilter');
  });

  it('spreads provided options', () => {
    const f = createBlurFilter({ blurX: 8, blurY: 4 });
    expect(f.blurX).toBe(8);
    expect(f.blurY).toBe(4);
  });
});
