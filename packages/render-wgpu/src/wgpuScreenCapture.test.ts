import type { WgpuScreenRenderTarget } from '@flighthq/types/contract';
import { beforeAll, describe, expect, it } from 'vitest';

import { beginWgpuRenderPass, endWgpuRenderPass } from './wgpuRenderPass';
import {
  createBitmapFromWgpuScreenRenderTarget,
  enableWgpuScreenRenderTargetCapture,
  encodeWgpuScreenRenderTargetCapture,
} from './wgpuScreenCapture';
import { createWgpuRenderStateForTest, createWgpuScreenRenderTargetForTest, installWgpuMock } from './wgpuTestHelper';

beforeAll(() => {
  installWgpuMock();
});

describe('createBitmapFromWgpuScreenRenderTarget', () => {
  it('throws when capture was never enabled (no buffer to read)', async () => {
    const state = await createWgpuRenderStateForTest();
    const screen = createWgpuScreenRenderTargetForTest(state);
    await expect(createBitmapFromWgpuScreenRenderTarget(screen)).rejects.toThrow(/enableWgpuScreenRenderTargetCapture/);
  });

  it('reads the mapped buffer within the bound', async () => {
    const state = await createWgpuRenderStateForTest();
    const screen = createWgpuScreenRenderTargetForTest(state);
    installCaptureBuffer(screen, () => Promise.resolve());

    const bitmap = await createBitmapFromWgpuScreenRenderTarget(screen, 1_000);

    expect(bitmap.width).toBe(1);
    expect(bitmap.height).toBe(1);
  });

  it('fails by name when the buffer never maps, instead of awaiting forever', async () => {
    // The driver failure this bounds: mapAsync neither resolves nor rejects. Before the bound, the
    // caller sat here until something outside it gave up and reported a stall with no location.
    const state = await createWgpuRenderStateForTest();
    const screen = createWgpuScreenRenderTargetForTest(state);
    installCaptureBuffer(screen, () => new Promise<void>(() => {}));

    await expect(createBitmapFromWgpuScreenRenderTarget(screen, 25)).rejects.toThrow(/did not map within 25ms/);
  });

  it('leaves the wait unbounded when the caller passes 0', async () => {
    const state = await createWgpuRenderStateForTest();
    const screen = createWgpuScreenRenderTargetForTest(state);
    let settle = (): void => {};
    installCaptureBuffer(screen, () => new Promise<void>((resolve) => (settle = resolve)));

    let done = false;
    const pending = createBitmapFromWgpuScreenRenderTarget(screen, 0).then(() => (done = true));
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(done).toBe(false);

    settle();
    await pending;
    expect(done).toBe(true);
  });
});

describe('enableWgpuScreenRenderTargetCapture', () => {
  it('sets the capture flag on the screen target', async () => {
    const state = await createWgpuRenderStateForTest();
    const screen = createWgpuScreenRenderTargetForTest(state);
    expect(screen.captureEnabled).toBe(false);
    enableWgpuScreenRenderTargetCapture(screen);
    expect(screen.captureEnabled).toBe(true);
  });

  it('redirects the frame into an offscreen texture rather than the swap chain', async () => {
    // The whole reason capture exists: software and headless adapters never present the swap chain, and
    // its texture reads back as zeros, so a captured frame must be drawn somewhere readable instead.
    const state = await createWgpuRenderStateForTest();
    const screen = createWgpuScreenRenderTargetForTest(state);
    expect(screen.captureTexture).toBeNull();

    enableWgpuScreenRenderTargetCapture(screen);
    endWgpuRenderPass(beginWgpuRenderPass(state, screen, { color: [0, 0, 0, 0] }));

    expect(screen.captureTexture).not.toBeNull();
  });
});

describe('encodeWgpuScreenRenderTargetCapture', () => {
  it('is a no-op when capture is disabled', async () => {
    const state = await createWgpuRenderStateForTest();
    const screen = createWgpuScreenRenderTargetForTest(state);
    let copied = false;
    const encoder = { copyTextureToBuffer: () => (copied = true) } as unknown as GPUCommandEncoder;
    encodeWgpuScreenRenderTargetCapture(screen, encoder);
    expect(copied).toBe(false);
  });

  it('skips the copy while a readback holds the buffer, and resumes once it lets go', async () => {
    // The writer/reader handshake over the single retained buffer: an animating scene must not keep
    // enqueueing copies into a buffer a readback has mapped or is waiting to map.
    const state = await createWgpuRenderStateForTest();
    const screen = captureReadyScreenRenderTarget(state);
    let mapState: GPUBufferMapState = 'unmapped';
    installCaptureBuffer(screen, () => Promise.resolve());
    Object.defineProperty(screen.captureBuffer, 'mapState', { get: () => mapState });

    let copies = 0;
    const encoder = { copyTextureToBuffer: () => copies++ } as unknown as GPUCommandEncoder;

    mapState = 'pending';
    encodeWgpuScreenRenderTargetCapture(screen, encoder);
    mapState = 'mapped';
    encodeWgpuScreenRenderTargetCapture(screen, encoder);
    expect(copies).toBe(0);

    mapState = 'unmapped';
    encodeWgpuScreenRenderTargetCapture(screen, encoder);
    expect(copies).toBe(1);
  });

  it('still copies when the implementation reports no map state at all', async () => {
    // Fails safe in the direction that keeps capturing: an undefined mapState must not read as "busy"
    // and silence every copy for the rest of the run.
    const state = await createWgpuRenderStateForTest();
    const screen = captureReadyScreenRenderTarget(state);
    installCaptureBuffer(screen, () => Promise.resolve());
    Object.defineProperty(screen.captureBuffer, 'mapState', { get: () => undefined });

    let copies = 0;
    encodeWgpuScreenRenderTargetCapture(screen, {
      copyTextureToBuffer: () => copies++,
    } as unknown as GPUCommandEncoder);

    expect(copies).toBe(1);
  });
});

// A screen target that has drawn one captured frame, so its capture texture exists.
function captureReadyScreenRenderTarget(
  state: Awaited<ReturnType<typeof createWgpuRenderStateForTest>>,
): WgpuScreenRenderTarget {
  const screen = createWgpuScreenRenderTargetForTest(state);
  enableWgpuScreenRenderTargetCapture(screen);
  endWgpuRenderPass(beginWgpuRenderPass(state, screen, { color: [0, 0, 0, 0] }));
  return screen;
}

// Installs a 1x1 retained capture buffer whose map step the caller controls, so the map bound can be
// exercised without a GPU. The mock device's buffers carry no map surface of their own.
function installCaptureBuffer(target: WgpuScreenRenderTarget, mapAsync: () => Promise<void>): void {
  target.captureBuffer = {
    mapAsync,
    getMappedRange: () => new ArrayBuffer(256),
    unmap: () => {},
    destroy: () => {},
  } as unknown as GPUBuffer;
  target.captureWidth = 1;
  target.captureHeight = 1;
  target.captureBytesPerRow = 256;
}
