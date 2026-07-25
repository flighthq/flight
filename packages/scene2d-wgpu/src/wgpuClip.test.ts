import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu';

import { enableWgpuClipSupport } from './wgpuClip';

beforeAll(() => {
  installWgpuMock();
});

describe('enableWgpuClipSupport', () => {
  it('sets displayObjectClipHooks', async () => {
    const state = await createWgpuRenderStateForTest();
    enableWgpuClipSupport(state);
    expect(state.displayObjectClipHooks).not.toBeNull();
  });
});
