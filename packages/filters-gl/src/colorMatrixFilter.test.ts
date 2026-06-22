import { applyColorMatrixFilterToGl } from './colorMatrixFilter';
import { makeFilterState, makeRenderTarget } from './testHelper';

const IDENTITY_MATRIX = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

describe('applyColorMatrixFilterToGl', () => {
  it('applies identity matrix without throwing', () => {
    const { state } = makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyColorMatrixFilterToGl(state, source, dest, { matrix: IDENTITY_MATRIX })).not.toThrow();
  });

  it('throws for a matrix with fewer than 20 values', () => {
    const { state } = makeFilterState();
    expect(() =>
      applyColorMatrixFilterToGl(state, makeRenderTarget(), makeRenderTarget(), { matrix: [1, 0, 0] }),
    ).toThrow();
  });
});
