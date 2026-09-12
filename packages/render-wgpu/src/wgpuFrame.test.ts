import {
  beginWgpuFrame,
  renderWgpuBackground,
  retireWgpuBuffer,
  retireWgpuTexture,
  submitWgpuRenderPass,
  withWgpuFrameBorrow,
} from './wgpuBackground';
import { createWgpuPipeline } from './wgpuPipeline';
import { createWgpuOffscreenRenderState, getWgpuRenderStateRuntime } from './wgpuRenderState';
import { createWgpuRenderStateForTest, installWgpuMock } from './wgpuTestHelper';

beforeAll(() => installWgpuMock());

describe('beginWgpuFrame', () => {
  it('opens one encoder and preserves it across repeated calls', async () => {
    const state = await createWgpuRenderStateForTest();
    beginWgpuFrame(state);
    const encoder = getWgpuRenderStateRuntime(state).commandEncoder;
    beginWgpuFrame(state);
    expect(getWgpuRenderStateRuntime(state).commandEncoder).toBe(encoder);
  });
});

describe('renderWgpuBackground', () => {
  it('opens the presentation pass on the current surface', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    expect(getWgpuRenderStateRuntime(state).renderPass).not.toBeNull();
    submitWgpuRenderPass(state);
  });
});

describe('retireWgpuBuffer', () => {
  it('adds the buffer to the post-submit destruction ledger', async () => {
    const state = await createWgpuRenderStateForTest();
    const buffer = { destroy: vi.fn() } as unknown as GPUBuffer;
    retireWgpuBuffer(state, buffer);
    expect(getWgpuRenderStateRuntime(state).retiredBuffers).toEqual([buffer]);
  });
});

describe('retireWgpuTexture', () => {
  it('adds the texture to the post-submit destruction ledger', async () => {
    const state = await createWgpuRenderStateForTest();
    const texture = { destroy: vi.fn() } as unknown as GPUTexture;
    retireWgpuTexture(state, texture);
    expect(getWgpuRenderStateRuntime(state).retiredTextures).toEqual([texture]);
  });
});

describe('submitWgpuRenderPass', () => {
  it('submits and closes the active frame', async () => {
    const state = await createWgpuRenderStateForTest();
    beginWgpuFrame(state);
    submitWgpuRenderPass(state);
    expect(getWgpuRenderStateRuntime(state).commandEncoder).toBeNull();
  });
});

describe('withWgpuFrameBorrow', () => {
  it('returns callback values and closes a standalone frame', async () => {
    const screen = await createWgpuRenderStateForTest();
    const offscreen = createWgpuOffscreenRenderState(
      screen.deviceState,
      createWgpuPipeline(getWgpuRenderStateRuntime(screen).registries),
      { format: screen.format },
    );

    expect(withWgpuFrameBorrow(screen, offscreen, () => 42)).toBe(42);
    expect(getWgpuRenderStateRuntime(screen).commandEncoder).toBeNull();
    expect(getWgpuRenderStateRuntime(offscreen).commandEncoder).toBeNull();
  });

  it('rejects a borrower owned by a different GPU device', async () => {
    const owner = await createWgpuRenderStateForTest();
    const other = await createWgpuRenderStateForTest();
    const borrower = createWgpuOffscreenRenderState(
      other.deviceState,
      createWgpuPipeline(getWgpuRenderStateRuntime(other).registries),
      { format: other.format },
    );

    expect(() => withWgpuFrameBorrow(owner, borrower, () => {})).toThrow(/same GPU device/);
    expect(getWgpuRenderStateRuntime(owner).commandEncoder).toBeNull();
    expect(getWgpuRenderStateRuntime(borrower).commandEncoder).toBeNull();
  });
});
