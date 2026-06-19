import { enableWebGPUClipSupport } from './webgpuClip';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

describe('enableWebGPUClipSupport', () => {
  it('sets displayObjectClipHooks', async () => {
    const state = await createWebGPURenderStateForTest();
    enableWebGPUClipSupport(state);
    expect(state.displayObjectClipHooks).not.toBeNull();
  });
});
