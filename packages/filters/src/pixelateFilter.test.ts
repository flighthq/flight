import { createPixelateFilter } from './pixelateFilter';

describe('createPixelateFilter', () => {
  it('sets type to pixelate', () => {
    expect(createPixelateFilter().kind).toBe('PixelateFilter');
  });

  it('spreads provided options', () => {
    expect(createPixelateFilter({ blockSize: 16 }).blockSize).toBe(16);
  });
});
