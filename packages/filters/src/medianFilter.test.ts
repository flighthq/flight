import { createMedianFilter } from './medianFilter';

describe('createMedianFilter', () => {
  it('sets type to median', () => {
    expect(createMedianFilter().kind).toBe('MedianFilter');
  });

  it('spreads provided options', () => {
    expect(createMedianFilter({ radius: 3 }).radius).toBe(3);
  });
});
