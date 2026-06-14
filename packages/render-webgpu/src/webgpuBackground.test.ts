import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

describe('renderWebGPUBackground', () => {
  it('opens a render pass on the state', async () => {
    const state = await createWebGPURenderStateForTest();
    expect((state as never as { renderPass: unknown }).renderPass).toBeNull();
    renderWebGPUBackground(state);
    expect((state as never as { renderPass: unknown }).renderPass).not.toBeNull();
  });

  it('resets uniformOffset to zero', async () => {
    const state = await createWebGPURenderStateForTest();
    const internal = state as never as { uniformOffset: number };
    internal.uniformOffset = 512;
    renderWebGPUBackground(state);
    expect(internal.uniformOffset).toBe(0);
  });

  it('creates a command encoder', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    expect((state as never as { commandEncoder: unknown }).commandEncoder).not.toBeNull();
  });
});

describe('submitWebGPURenderPass', () => {
  it('clears commandEncoder after submit', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    submitWebGPURenderPass(state);
    expect((state as never as { commandEncoder: unknown }).commandEncoder).toBeNull();
  });

  it('clears renderPass after submit', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    submitWebGPURenderPass(state);
    expect((state as never as { renderPass: unknown }).renderPass).toBeNull();
  });

  it('is safe to call without an open pass', async () => {
    const state = await createWebGPURenderStateForTest();
    expect(() => submitWebGPURenderPass(state)).not.toThrow();
  });
});
