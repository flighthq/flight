import { renderWgpuBackground, submitWgpuRenderPass } from './wgpuBackground';
import { getWgpuRenderStateRuntime } from './wgpuRenderState';
import { createWgpuRenderStateForTest, installWgpuMock } from './wgpuTestHelper';

beforeAll(() => {
  installWgpuMock();
});

describe('renderWgpuBackground', () => {
  it('opens a render pass on the state', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    expect(runtime.renderPass).toBeNull();
    renderWgpuBackground(state);
    expect(runtime.renderPass).not.toBeNull();
  });

  it('resets uniformOffset to zero', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    runtime.uniformOffset = 512;
    renderWgpuBackground(state);
    expect(runtime.uniformOffset).toBe(0);
  });

  it('creates a command encoder', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    expect(getWgpuRenderStateRuntime(state).commandEncoder).not.toBeNull();
  });
});

describe('submitWgpuRenderPass', () => {
  it('clears commandEncoder after submit', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    submitWgpuRenderPass(state);
    expect(getWgpuRenderStateRuntime(state).commandEncoder).toBeNull();
  });

  it('clears renderPass after submit', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    submitWgpuRenderPass(state);
    expect(getWgpuRenderStateRuntime(state).renderPass).toBeNull();
  });

  it('is safe to call without an open pass', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(() => submitWgpuRenderPass(state)).not.toThrow();
  });
});
