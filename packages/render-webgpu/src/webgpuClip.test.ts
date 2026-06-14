import { hasRenderFeatures } from '@flighthq/render';
import { RenderFeatures } from '@flighthq/types';

import { enableWebGPUClipRectangleSupport, enableWebGPUMaskSupport } from './webgpuClip';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

describe('enableWebGPUClipRectangleSupport', () => {
  it('sets displayObjectClipHooks and enables ClipRectangle feature', async () => {
    const state = await createWebGPURenderStateForTest();
    enableWebGPUClipRectangleSupport(state);
    expect(state.displayObjectClipHooks).not.toBeNull();
    expect(hasRenderFeatures(state, RenderFeatures.ClipRectangle)).toBe(true);
  });
});

describe('enableWebGPUMaskSupport', () => {
  it('sets displayObjectClipHooks and enables Masks feature', async () => {
    const state = await createWebGPURenderStateForTest();
    enableWebGPUMaskSupport(state);
    expect(state.displayObjectClipHooks).not.toBeNull();
    expect(hasRenderFeatures(state, RenderFeatures.Masks)).toBe(true);
  });
});
