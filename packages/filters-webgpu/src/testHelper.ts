import { createWebGPURenderStateForTest, installWebGPUMock } from '@flighthq/render-webgpu';
import { renderWebGPUBackground } from '@flighthq/render-webgpu';
import type { WebGPURenderState, WebGPURenderTarget } from '@flighthq/types';

export { installWebGPUMock };

/** Creates a WebGPU render state suitable for filter tests. Caller must call installWebGPUMock() first. */
export async function makeFilterState(): Promise<WebGPURenderState> {
  const state = await createWebGPURenderStateForTest();
  // Begin a frame so commandEncoder is non-null (required by filter passes).
  renderWebGPUBackground(state);
  return state;
}

export function makeRenderTarget(width = 64, height = 64): WebGPURenderTarget {
  return {
    texture: { destroy: () => {} } as unknown as GPUTexture,
    view: {} as GPUTextureView,
    depthStencilTexture: { destroy: () => {} } as unknown as GPUTexture,
    depthStencilView: {} as GPUTextureView,
    width,
    height,
  };
}

export function makeScratch(count = 3, width = 64, height = 64): WebGPURenderTarget[] {
  return Array.from({ length: count }, () => makeRenderTarget(width, height));
}
