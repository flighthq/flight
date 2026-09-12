import type { WgpuRenderTarget, WgpuScreenRenderTarget } from '@flighthq/types/contract';

import { beginWgpuRenderPass, endWgpuRenderPass } from './wgpuRenderPass';
import { getWgpuRenderStateRuntime } from './wgpuRenderState';
import { declareWgpuRenderTargetColorSpace, getWgpuRenderTargetSupersampleScale } from './wgpuRenderTarget';
import {
  beginWgpuScreenRenderPassForTest,
  createWgpuRenderStateForTest,
  createWgpuScreenRenderTargetForTest,
  installWgpuMock,
} from './wgpuTestHelper';
import { createWgpuTextureRenderTarget } from './wgpuTextureRenderTarget';

beforeAll(() => {
  installWgpuMock();
});

describe('declareWgpuRenderTargetColorSpace', () => {
  it('stamps the innermost open target and reports false outside a pass', async () => {
    const state = await createWgpuRenderStateForTest();
    const outer = createWgpuTextureRenderTarget(state, 32, 32);
    const inner = createWgpuTextureRenderTarget(state, 16, 16);

    expect(declareWgpuRenderTargetColorSpace(state, 'linear')).toBe(false);

    const screenPass = beginWgpuScreenRenderPassForTest(state);
    const outerPass = beginWgpuRenderPass(state, outer);
    expect(declareWgpuRenderTargetColorSpace(state, 'linear')).toBe(true);
    const innerPass = beginWgpuRenderPass(state, inner);
    expect(declareWgpuRenderTargetColorSpace(state, 'linear')).toBe(true);

    endWgpuRenderPass(innerPass);
    expect(getWgpuRenderStateRuntime(state).currentRenderTarget).toBe(outer);
    endWgpuRenderPass(outerPass);
    endWgpuRenderPass(screenPass);

    expect(outer.colorSpace).toBe('linear');
    expect(inner.colorSpace).toBe('linear');
  });
});

describe('getWgpuRenderTargetSupersampleScale', () => {
  // ★ THE ALLOCATOR AND THE PROJECTION HAVE TO AGREE. A sampleCount-4 target is allocated at 2x per axis;
  // if the 2D projection divides by that physical width it maps logical x = 800 to NDC 0, and the scene
  // fills a quarter of its own target. Measured on effect-sepia before the repair: the WebGPU frame
  // equalled the WebGL frame sampled at (2x, 2y) on 12 of 12 grid points; after, 48 of 48 matched 1:1.
  it('reports 2 for a supersampled texture target and 1 for a single-sample one', () => {
    expect(getWgpuRenderTargetSupersampleScale({ context: null, sampleCount: 4 } as WgpuRenderTarget)).toBe(2);
    expect(getWgpuRenderTargetSupersampleScale({ context: null, sampleCount: 1 } as WgpuRenderTarget)).toBe(1);
  });

  // A screen target reaches supersampling by a different route — an antialias option rather than a sample
  // count — and the two must resolve to one number, or the scissor and the projection disagree about which
  // coordinate space the frame is in.
  it('reads a screen target from its antialias option, not its sample count', async () => {
    const state = await createWgpuRenderStateForTest();
    const plain = createWgpuScreenRenderTargetForTest(state);
    const antialiased = createWgpuScreenRenderTargetForTest(state, { antialias: true });

    expect(getWgpuRenderTargetSupersampleScale(plain)).toBe(1);
    expect(getWgpuRenderTargetSupersampleScale(antialiased)).toBe(2);
    expect(antialiased.sampleCount).toBe(1);
  });

  // Dividing the physical extent by the scale has to land back on the logical extent exactly, or the
  // projection drifts by a pixel at odd sizes. The allocator ceils BEFORE scaling, which is what makes
  // this exact rather than approximately right.
  it('inverts the allocator exactly, including at an odd logical size', () => {
    for (const [logical, sampleCount] of [
      [801, 4],
      [599, 4],
      [800, 1],
      [1, 4],
    ] as const) {
      const physical = Math.max(1, Math.ceil(logical)) * (sampleCount === 4 ? 2 : 1);
      const scale = getWgpuRenderTargetSupersampleScale({ context: null, sampleCount } as WgpuRenderTarget);

      expect(physical / scale).toBe(logical);
    }
  });

  it('inverts the screen allocator exactly for a supersampled surface', async () => {
    const state = await createWgpuRenderStateForTest();
    const screen: WgpuScreenRenderTarget = createWgpuScreenRenderTargetForTest(state, { antialias: true }, 801, 599);

    expect(screen.width).toBe(1602);
    expect(screen.width / getWgpuRenderTargetSupersampleScale(screen)).toBe(801);
    expect(screen.height / getWgpuRenderTargetSupersampleScale(screen)).toBe(599);
  });
});
