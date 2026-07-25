import { renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu';

import { popWgpuClipRectangle, pushWgpuClipRectangle } from './wgpuClipRectangle';

beforeAll(() => {
  installWgpuMock();
});

describe('popWgpuClipRectangle', () => {
  it('pops the scissor rect from the stack', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const runtime = getWgpuRenderStateRuntime(state);

    pushWgpuClipRectangle(state, { x: 0, y: 0, width: 50, height: 50 }, { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });
    popWgpuClipRectangle(state);

    expect(runtime.scissorStack.length).toBe(0);
    expect(runtime.currentScissorRect).toBeNull();
    submitWgpuRenderPass(state);
  });

  it('is safe to pop from empty stack', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    expect(() => popWgpuClipRectangle(state)).not.toThrow();
    submitWgpuRenderPass(state);
  });
});

describe('pushWgpuClipRectangle', () => {
  it('pushes a scissor rect onto the stack', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const runtime = getWgpuRenderStateRuntime(state);

    pushWgpuClipRectangle(state, { x: 10, y: 10, width: 100, height: 100 }, { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });

    expect(runtime.scissorStack.length).toBe(1);
    expect(runtime.currentScissorRect).not.toBeNull();
    submitWgpuRenderPass(state);
  });
});
