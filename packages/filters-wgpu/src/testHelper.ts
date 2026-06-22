import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu';
import { renderWgpuBackground } from '@flighthq/render-wgpu';
import type { WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

export { installWgpuMock };

/** Creates a Wgpu render state suitable for filter tests. Caller must call installWgpuMock() first. */
export async function makeFilterState(): Promise<WgpuRenderState> {
  const state = await createWgpuRenderStateForTest();
  // Begin a frame so commandEncoder is non-null (required by filter passes).
  renderWgpuBackground(state);
  return state;
}

export function makeRenderTarget(width = 64, height = 64): WgpuRenderTarget {
  return {
    bindGroup: {} as GPUBindGroup,
    texture: { destroy: () => {} } as unknown as GPUTexture,
    view: {} as GPUTextureView,
    depthStencilTexture: { destroy: () => {} } as unknown as GPUTexture,
    depthStencilView: {} as GPUTextureView,
    format: 'bgra8unorm',
    width,
    height,
  };
}

export function makeScratch(count = 3, width = 64, height = 64): WgpuRenderTarget[] {
  return Array.from({ length: count }, () => makeRenderTarget(width, height));
}
