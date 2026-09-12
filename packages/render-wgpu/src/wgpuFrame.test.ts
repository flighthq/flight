import { beginWgpuFrame, retireWgpuBuffer, retireWgpuTexture, submitWgpuFrame, withWgpuFrameBorrow } from './wgpuFrame';
import { createWgpuPipeline } from './wgpuPipeline';
import { createWgpuOffscreenRenderState, getWgpuRenderStateRuntime } from './wgpuRenderState';
import { beginWgpuScreenRenderPassForTest, createWgpuRenderStateForTest, installWgpuMock } from './wgpuTestHelper';

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

describe('submitWgpuFrame', () => {
  it('submits and closes the active frame', async () => {
    const state = await createWgpuRenderStateForTest();
    beginWgpuFrame(state);
    submitWgpuFrame(state);
    expect(getWgpuRenderStateRuntime(state).commandEncoder).toBeNull();
  });

  it('closes a pass the caller left open rather than carrying its encoder into the next frame', async () => {
    const state = await createWgpuRenderStateForTest();
    beginWgpuFrame(state);
    beginWgpuScreenRenderPassForTest(state);
    expect(getWgpuRenderStateRuntime(state).renderPass).not.toBeNull();

    submitWgpuFrame(state);

    const runtime = getWgpuRenderStateRuntime(state);
    expect(runtime.renderPass).toBeNull();
    expect(runtime.passStack).toEqual([]);
    expect(runtime.currentRenderTarget).toBeNull();
    expect(runtime.renderTargetViewport).toBeNull();
  });
  // A frame that only drew into texture targets has no screen to resolve or capture. Skipping that work
  // is not an optimization: the capture texture still holds the LAST VISIBLE frame, so encoding a copy
  // here would overwrite the readback buffer with a stale picture that a caller would read as current.
  it('resolves and captures nothing when the frame never touched a screen target', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    beginWgpuFrame(state);
    const encoder = runtime.commandEncoder!;
    const copyToBuffer = vi.spyOn(encoder, 'copyTextureToBuffer');

    expect(runtime.frameScreenTarget).toBeNull();
    submitWgpuFrame(state);

    expect(copyToBuffer).not.toHaveBeenCalled();
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
