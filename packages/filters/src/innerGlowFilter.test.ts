import { createInnerGlowFilter } from './innerGlowFilter';

describe('createInnerGlowFilter', () => {
  it('sets type to innerGlow', () => {
    expect(createInnerGlowFilter().kind).toBe('InnerGlowFilter');
  });

  it('spreads provided options', () => {
    const f = createInnerGlowFilter({ color: 0x00ff00, strength: 2 });
    expect(f.color).toBe(0x00ff00);
    expect(f.strength).toBe(2);
  });
});
