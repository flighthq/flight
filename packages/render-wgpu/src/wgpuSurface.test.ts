import type { WgpuRenderState } from '@flighthq/types/contract';
import { beforeAll, describe, expect, it } from 'vitest';

import { getWgpuRenderStateRuntime } from './wgpuRenderState';
import {
  acquireWgpuFrameCaptureTexture,
  createBitmapFromWgpuRenderState,
  enableWgpuFrameCapture,
  encodeWgpuFrameCapture,
} from './wgpuSurface';
import { createWgpuRenderStateForTest, installWgpuMock } from './wgpuTestHelper';

beforeAll(() => {
  installWgpuMock();
});

describe('acquireWgpuFrameCaptureTexture', () => {
  it('returns null until capture is enabled, then an offscreen texture', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(acquireWgpuFrameCaptureTexture(state)).toBeNull();
    enableWgpuFrameCapture(state);
    expect(acquireWgpuFrameCaptureTexture(state)).not.toBeNull();
  });
});

describe('createBitmapFromWgpuRenderState', () => {
  it('throws when frame capture was never enabled (no buffer to read)', async () => {
    const state = await createWgpuRenderStateForTest();
    await expect(createBitmapFromWgpuRenderState(state)).rejects.toThrow(/enableWgpuFrameCapture/);
  });

  it('reads the mapped buffer within the bound', async () => {
    const state = await createWgpuRenderStateForTest();
    installCaptureBuffer(state, () => Promise.resolve());

    const bitmap = await createBitmapFromWgpuRenderState(state, 1_000);

    expect(bitmap.width).toBe(1);
    expect(bitmap.height).toBe(1);
  });

  it('fails by name when the buffer never maps, instead of awaiting forever', async () => {
    // The driver failure this bounds: mapAsync neither resolves nor rejects. Before the bound, the
    // caller sat here until something outside it gave up and reported a stall with no location.
    const state = await createWgpuRenderStateForTest();
    installCaptureBuffer(state, () => new Promise<void>(() => {}));

    await expect(createBitmapFromWgpuRenderState(state, 25)).rejects.toThrow(/did not map within 25ms/);
  });

  it('leaves the wait unbounded when the caller passes 0', async () => {
    const state = await createWgpuRenderStateForTest();
    let settle = (): void => {};
    installCaptureBuffer(state, () => new Promise<void>((resolve) => (settle = resolve)));

    let done = false;
    const pending = createBitmapFromWgpuRenderState(state, 0).then(() => (done = true));
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(done).toBe(false);

    settle();
    await pending;
    expect(done).toBe(true);
  });
});

// Installs a 1×1 retained capture buffer whose map step the caller controls, so the map bound can be
// exercised without a GPU. The mock device's buffers carry no map surface of their own.
function installCaptureBuffer(state: WgpuRenderState, mapAsync: () => Promise<void>): void {
  const runtime = getWgpuRenderStateRuntime(state);
  runtime.frameCaptureBuffer = {
    mapAsync,
    getMappedRange: () => new ArrayBuffer(256),
    unmap: () => {},
    destroy: () => {},
  } as unknown as GPUBuffer;
  runtime.frameCaptureWidth = 1;
  runtime.frameCaptureHeight = 1;
  runtime.frameCaptureBytesPerRow = 256;
}

describe('enableWgpuFrameCapture', () => {
  it('sets the capture flag on the render state runtime', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(getWgpuRenderStateRuntime(state).frameCaptureEnabled).toBeFalsy();
    enableWgpuFrameCapture(state);
    expect(getWgpuRenderStateRuntime(state).frameCaptureEnabled).toBe(true);
  });
});

describe('encodeWgpuFrameCapture', () => {
  it('is a no-op when capture is disabled', async () => {
    const state = await createWgpuRenderStateForTest();
    let copied = false;
    const encoder = { copyTextureToBuffer: () => (copied = true) } as unknown as GPUCommandEncoder;
    encodeWgpuFrameCapture(state, encoder);
    expect(copied).toBe(false);
  });
});
