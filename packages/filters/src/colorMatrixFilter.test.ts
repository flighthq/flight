import { createColorMatrixFilter } from './colorMatrixFilter';

describe('createColorMatrixFilter', () => {
  it('sets type to colorMatrix', () => {
    const m = new Array(20).fill(0);
    expect(createColorMatrixFilter(m).kind).toBe('ColorMatrixFilter');
  });

  it('stores the provided matrix', () => {
    const m = new Array(20).fill(1);
    expect(createColorMatrixFilter(m).matrix).toBe(m);
  });
});
