import { createOuterGlowFilter } from './outerGlowFilter';

describe('createOuterGlowFilter', () => {
  it('sets type to outerGlow', () => {
    expect(createOuterGlowFilter().kind).toBe('OuterGlowFilter');
  });

  it('spreads provided options', () => {
    const f = createOuterGlowFilter({ color: 0xffff00, knockout: true });
    expect(f.color).toBe(0xffff00);
    expect(f.knockout).toBe(true);
  });
});
