import { applyColorMatrixFilterToWebGL } from './colorMatrixFilter';
import { makeFilterState, makeRenderTarget } from './testHelper';

const IDENTITY_MATRIX = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

describe('applyColorMatrixFilterToWebGL', () => {
  it('applies identity matrix without throwing', () => {
    const { state } = makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyColorMatrixFilterToWebGL(state, source, dest, { matrix: IDENTITY_MATRIX })).not.toThrow();
  });

  it('throws for a matrix with fewer than 20 values', () => {
    const { state } = makeFilterState();
    expect(() =>
      applyColorMatrixFilterToWebGL(state, makeRenderTarget(), makeRenderTarget(), { matrix: [1, 0, 0] }),
    ).toThrow();
  });
});
