import { createDisplacementMapFilter } from './displacementMapFilter';

describe('createDisplacementMapFilter', () => {
  it('sets type to displacementMap', () => {
    expect(createDisplacementMapFilter().kind).toBe('DisplacementMapFilter');
  });

  it('spreads provided options', () => {
    const f = createDisplacementMapFilter({ scaleX: 10, scaleY: 5 });
    expect(f.scaleX).toBe(10);
    expect(f.scaleY).toBe(5);
  });
});
