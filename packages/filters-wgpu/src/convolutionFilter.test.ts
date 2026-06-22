import { describe, expect, it } from 'vitest';

import { applyConvolutionFilterToWgpu } from './convolutionFilter';
import { installWgpuMock, makeFilterState, makeRenderTarget } from './testHelper';

installWgpuMock();

describe('applyConvolutionFilterToWgpu', () => {
  it('applies a 3×3 identity kernel without error', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() =>
      applyConvolutionFilterToWgpu(state, source, dest, {
        matrix: [0, 0, 0, 0, 1, 0, 0, 0, 0],
        matrixX: 3,
        matrixY: 3,
      }),
    ).not.toThrow();
  });

  it('applies a 7×7 kernel (maximum supported)', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    const matrix = Array(49).fill(1 / 49);
    expect(() => applyConvolutionFilterToWgpu(state, source, dest, { matrix, matrixX: 7, matrixY: 7 })).not.toThrow();
  });

  it('throws for kernels exceeding 7×7', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() =>
      applyConvolutionFilterToWgpu(state, source, dest, {
        matrix: Array(64).fill(1 / 64),
        matrixX: 8,
        matrixY: 8,
      }),
    ).toThrow('exceeds the WebGPU maximum of 7×7');
  });

  it('throws for zero or negative matrix dimensions', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() =>
      applyConvolutionFilterToWgpu(state, source, dest, {
        matrix: [1],
        matrixX: 0,
        matrixY: 1,
      }),
    ).toThrow('dimensions must be positive');
  });

  it('throws when matrix is smaller than declared dimensions', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() =>
      applyConvolutionFilterToWgpu(state, source, dest, {
        matrix: [1, 0, 0],
        matrixX: 3,
        matrixY: 3,
      }),
    ).toThrow('does not match its declared dimensions');
  });

  it('uses auto divisor when not specified (sum of weights)', async () => {
    const state = await makeFilterState();
    const source = makeRenderTarget();
    const dest = makeRenderTarget();
    expect(() =>
      applyConvolutionFilterToWgpu(state, source, dest, {
        matrix: [1, 1, 1, 1, 1, 1, 1, 1, 1],
        matrixX: 3,
        matrixY: 3,
      }),
    ).not.toThrow();
  });
});
