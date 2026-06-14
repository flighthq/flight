import type { WebGPURenderStateInternal } from './internal';
import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import { popWebGPUClipRectangle, pushWebGPUClipRectangle } from './webgpuClipRectangle';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

describe('popWebGPUClipRectangle', () => {
  it('pops the scissor rect from the stack', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const internal = state as unknown as WebGPURenderStateInternal;

    pushWebGPUClipRectangle(internal, { x: 0, y: 0, width: 50, height: 50 }, { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });
    popWebGPUClipRectangle(internal);

    expect(internal.scissorStack.length).toBe(0);
    expect(internal.currentScissorRect).toBeNull();
    submitWebGPURenderPass(state);
  });

  it('is safe to pop from empty stack', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const internal = state as unknown as WebGPURenderStateInternal;
    expect(() => popWebGPUClipRectangle(internal)).not.toThrow();
    submitWebGPURenderPass(state);
  });
});

describe('pushWebGPUClipRectangle', () => {
  it('pushes a scissor rect onto the stack', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const internal = state as unknown as WebGPURenderStateInternal;

    pushWebGPUClipRectangle(
      internal,
      { x: 10, y: 10, width: 100, height: 100 },
      { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    );

    expect(internal.scissorStack.length).toBe(1);
    expect(internal.currentScissorRect).not.toBeNull();
    submitWebGPURenderPass(state);
  });
});
