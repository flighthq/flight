import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import { popWebGPUClipRectangle, pushWebGPUClipRectangle } from './webgpuClipRectangle';
import { getWebGPURenderStateRuntime } from './webgpuRenderState';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

describe('popWebGPUClipRectangle', () => {
  it('pops the scissor rect from the stack', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const runtime = getWebGPURenderStateRuntime(state);

    pushWebGPUClipRectangle(state, { x: 0, y: 0, width: 50, height: 50 }, { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });
    popWebGPUClipRectangle(state);

    expect(runtime.scissorStack.length).toBe(0);
    expect(runtime.currentScissorRect).toBeNull();
    submitWebGPURenderPass(state);
  });

  it('is safe to pop from empty stack', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    expect(() => popWebGPUClipRectangle(state)).not.toThrow();
    submitWebGPURenderPass(state);
  });
});

describe('pushWebGPUClipRectangle', () => {
  it('pushes a scissor rect onto the stack', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const runtime = getWebGPURenderStateRuntime(state);

    pushWebGPUClipRectangle(state, { x: 10, y: 10, width: 100, height: 100 }, { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });

    expect(runtime.scissorStack.length).toBe(1);
    expect(runtime.currentScissorRect).not.toBeNull();
    submitWebGPURenderPass(state);
  });
});
