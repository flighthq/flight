import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import { getWebGPURenderStateRuntime } from './webgpuRenderState';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

describe('renderWebGPUBackground', () => {
  it('opens a render pass on the state', async () => {
    const state = await createWebGPURenderStateForTest();
    const runtime = getWebGPURenderStateRuntime(state);
    expect(runtime.renderPass).toBeNull();
    renderWebGPUBackground(state);
    expect(runtime.renderPass).not.toBeNull();
  });

  it('resets uniformOffset to zero', async () => {
    const state = await createWebGPURenderStateForTest();
    const runtime = getWebGPURenderStateRuntime(state);
    runtime.uniformOffset = 512;
    renderWebGPUBackground(state);
    expect(runtime.uniformOffset).toBe(0);
  });

  it('creates a command encoder', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    expect(getWebGPURenderStateRuntime(state).commandEncoder).not.toBeNull();
  });
});

describe('submitWebGPURenderPass', () => {
  it('clears commandEncoder after submit', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    submitWebGPURenderPass(state);
    expect(getWebGPURenderStateRuntime(state).commandEncoder).toBeNull();
  });

  it('clears renderPass after submit', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    submitWebGPURenderPass(state);
    expect(getWebGPURenderStateRuntime(state).renderPass).toBeNull();
  });

  it('is safe to call without an open pass', async () => {
    const state = await createWebGPURenderStateForTest();
    expect(() => submitWebGPURenderPass(state)).not.toThrow();
  });
});
