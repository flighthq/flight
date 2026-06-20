import { beforeAll, describe, expect, it } from 'vitest';

import { getWebGPURenderStateRuntime } from './webgpuRenderState';
import {
  acquireWebGPUFrameCaptureTexture,
  createSurfaceFromWebGPURenderState,
  enableWebGPUFrameCapture,
  encodeWebGPUFrameCapture,
} from './webgpuSurface';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

describe('acquireWebGPUFrameCaptureTexture', () => {
  it('returns null until capture is enabled, then an offscreen texture', async () => {
    const state = await createWebGPURenderStateForTest();
    expect(acquireWebGPUFrameCaptureTexture(state)).toBeNull();
    enableWebGPUFrameCapture(state);
    expect(acquireWebGPUFrameCaptureTexture(state)).not.toBeNull();
  });
});

describe('createSurfaceFromWebGPURenderState', () => {
  it('throws when frame capture was never enabled (no buffer to read)', async () => {
    const state = await createWebGPURenderStateForTest();
    await expect(createSurfaceFromWebGPURenderState(state)).rejects.toThrow(/enableWebGPUFrameCapture/);
  });
});

describe('enableWebGPUFrameCapture', () => {
  it('sets the capture flag on the render state runtime', async () => {
    const state = await createWebGPURenderStateForTest();
    expect(getWebGPURenderStateRuntime(state).frameCaptureEnabled).toBeFalsy();
    enableWebGPUFrameCapture(state);
    expect(getWebGPURenderStateRuntime(state).frameCaptureEnabled).toBe(true);
  });
});

describe('encodeWebGPUFrameCapture', () => {
  it('is a no-op when capture is disabled', async () => {
    const state = await createWebGPURenderStateForTest();
    let copied = false;
    const encoder = { copyTextureToBuffer: () => (copied = true) } as unknown as GPUCommandEncoder;
    encodeWebGPUFrameCapture(state, encoder);
    expect(copied).toBe(false);
  });
});
