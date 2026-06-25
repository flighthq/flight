import { renderWgpuBackground } from './wgpuBackground';
import { getWgpuRenderStateRuntime } from './wgpuRenderState';
import { applyWgpuScissorRect, popWgpuScissorRect, pushWgpuScissorRect } from './wgpuScissor';
import { createWgpuRenderStateForTest, installWgpuMock } from './wgpuTestHelper';

beforeAll(() => {
  installWgpuMock();
});

describe('applyWgpuScissorRect', () => {
  it('calls setScissorRect on the pass when a rect is active', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const runtime = getWgpuRenderStateRuntime(state);
    runtime.currentScissorRect = { x: 10, y: 20, width: 100, height: 50 };
    const calls: number[][] = [];
    const fakePass = { setScissorRect: (...args: number[]) => calls.push(args) } as unknown as GPURenderPassEncoder;
    applyWgpuScissorRect(state, fakePass);
    expect(calls.length).toBe(1);
    expect(calls[0]).toEqual([10, 20, 100, 50]);
  });

  it('is a no-op when currentScissorRect is null', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const calls: number[][] = [];
    const fakePass = { setScissorRect: (...args: number[]) => calls.push(args) } as unknown as GPURenderPassEncoder;
    applyWgpuScissorRect(state, fakePass);
    expect(calls.length).toBe(0);
  });

  it('clamps dimensions to at least 1×1', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const runtime = getWgpuRenderStateRuntime(state);
    runtime.currentScissorRect = { x: 0, y: 0, width: 0, height: 0 };
    const calls: number[][] = [];
    const fakePass = { setScissorRect: (...args: number[]) => calls.push(args) } as unknown as GPURenderPassEncoder;
    applyWgpuScissorRect(state, fakePass);
    expect(calls[0]).toEqual([0, 0, 1, 1]);
  });
});

describe('popWgpuScissorRect', () => {
  it('is a no-op when the stack is empty', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    expect(() => popWgpuScissorRect(state)).not.toThrow();
    expect(getWgpuRenderStateRuntime(state).currentScissorRect).toBeNull();
  });

  it('restores the previous rect after a push/pop pair', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const r1 = { x: 0, y: 0, width: 100, height: 100 };
    const r2 = { x: 10, y: 10, width: 50, height: 50 };
    pushWgpuScissorRect(state, r1);
    pushWgpuScissorRect(state, r2);
    popWgpuScissorRect(state);
    const runtime = getWgpuRenderStateRuntime(state);
    expect(runtime.currentScissorRect).toEqual(r1);
    popWgpuScissorRect(state);
    expect(runtime.currentScissorRect).toBeNull();
  });
});

describe('pushWgpuScissorRect', () => {
  it('sets currentScissorRect on first push', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const rect = { x: 5, y: 10, width: 80, height: 40 };
    pushWgpuScissorRect(state, rect);
    expect(getWgpuRenderStateRuntime(state).currentScissorRect).toEqual(rect);
  });

  it('stacks previous rect when pushing a second rect', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const r1 = { x: 0, y: 0, width: 100, height: 100 };
    const r2 = { x: 20, y: 20, width: 60, height: 60 };
    pushWgpuScissorRect(state, r1);
    pushWgpuScissorRect(state, r2);
    const runtime = getWgpuRenderStateRuntime(state);
    expect(runtime.currentScissorRect).toEqual(r2);
    expect(runtime.scissorStack.length).toBe(1);
    expect(runtime.scissorStack[0]).toEqual(r1);
  });

  it('copies the rect so mutation of the original does not affect the pushed value', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const rect = { x: 0, y: 0, width: 50, height: 50 };
    pushWgpuScissorRect(state, rect);
    rect.width = 999;
    expect(getWgpuRenderStateRuntime(state).currentScissorRect?.width).toBe(50);
  });
});
