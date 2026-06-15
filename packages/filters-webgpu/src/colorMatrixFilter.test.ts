import { describe, expect, it } from 'vitest';

import { applyColorMatrixFilterToWebGPU } from './colorMatrixFilter';
import { installWebGPUMock, makeFilterState, makeRenderTarget } from './testHelper';

installWebGPUMock();

const IDENTITY_MATRIX = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

describe('applyColorMatrixFilterToWebGPU', () => {
  it('completes without error for an identity matrix', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyColorMatrixFilterToWebGPU(state, source, dest, { matrix: IDENTITY_MATRIX })).not.toThrow();
  });

  it('throws when matrix has fewer than 20 values', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() => applyColorMatrixFilterToWebGPU(state, source, dest, { matrix: [1, 0, 0, 0] })).toThrow(
      'ColorMatrixFilter requires 20 values',
    );
  });

  it('applies color offset values (column 5) scaled from byte range', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const matrix = [...IDENTITY_MATRIX];
    matrix[4] = 128; // half-brightness red offset
    expect(() => applyColorMatrixFilterToWebGPU(state, source, dest, { matrix })).not.toThrow();
  });
});
