import { createInnerShadowFilter } from './innerShadowFilter';

describe('createInnerShadowFilter', () => {
  it('sets type to innerShadow', () => {
    expect(createInnerShadowFilter().kind).toBe('InnerShadowFilter');
  });

  it('spreads provided options', () => {
    const f = createInnerShadowFilter({ angle: 90, distance: 4 });
    expect(f.angle).toBe(90);
    expect(f.distance).toBe(4);
  });
});
