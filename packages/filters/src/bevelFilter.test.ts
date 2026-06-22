import { createBevelFilter } from './bevelFilter';

describe('createBevelFilter', () => {
  it('sets type to bevel', () => {
    expect(createBevelFilter().kind).toBe('BevelFilter');
  });

  it('spreads provided options', () => {
    const f = createBevelFilter({ strength: 2, bevelType: 'outer' });
    expect(f.strength).toBe(2);
    expect(f.bevelType).toBe('outer');
  });
});
