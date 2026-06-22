import { createDropShadowFilter } from './dropShadowFilter';

describe('createDropShadowFilter', () => {
  it('sets type to dropShadow', () => {
    expect(createDropShadowFilter().kind).toBe('DropShadowFilter');
  });

  it('spreads provided options', () => {
    const f = createDropShadowFilter({ color: 0xff0000, distance: 8 });
    expect(f.color).toBe(0xff0000);
    expect(f.distance).toBe(8);
  });
});
