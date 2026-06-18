import { enableWebGPUClipRectangleSupport, enableWebGPUMaskSupport } from './webgpuClip';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

describe('enableWebGPUClipRectangleSupport', () => {
  it('sets displayObjectClipHooks', async () => {
    const state = await createWebGPURenderStateForTest();
    enableWebGPUClipRectangleSupport(state);
    expect(state.displayObjectClipHooks).not.toBeNull();
  });
});

describe('enableWebGPUMaskSupport', () => {
  it('sets displayObjectClipHooks', async () => {
    const state = await createWebGPURenderStateForTest();
    enableWebGPUMaskSupport(state);
    expect(state.displayObjectClipHooks).not.toBeNull();
  });
});
