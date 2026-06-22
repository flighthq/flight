import { beforeAll, describe, expect, it } from 'vitest';

import { getWgpuRenderStateRuntime } from './wgpuRenderState';
import {
  acquireWgpuFrameCaptureTexture,
  createSurfaceFromWgpuRenderState,
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

describe('createSurfaceFromWgpuRenderState', () => {
  it('throws when frame capture was never enabled (no buffer to read)', async () => {
    const state = await createWgpuRenderStateForTest();
    await expect(createSurfaceFromWgpuRenderState(state)).rejects.toThrow(/enableWgpuFrameCapture/);
  });
});

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
