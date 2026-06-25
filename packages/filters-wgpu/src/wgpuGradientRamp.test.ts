import { describe, expect, it } from 'vitest';

import {
  createWgpuGradientRampTexture,
  destroyWgpuGradientRampTextures,
  getWgpuGradientRampTexture,
} from './wgpuGradientRamp';
import { installWgpuMock, makeFilterState } from './wgpuTestHelper';

installWgpuMock();

describe('createWgpuGradientRampTexture', () => {
  it('creates a 256×1 texture from a two-stop gradient', async () => {
    const state = await makeFilterState();
    const internalState = state as never as {
      device: { createTexture: ReturnType<typeof vi.fn>; queue: { writeTexture: ReturnType<typeof vi.fn> } };
    };
    const createTextureSpy = vi.spyOn(internalState.device, 'createTexture');
    const writeTextureSpy = vi.spyOn(internalState.device.queue, 'writeTexture');

    const tex = createWgpuGradientRampTexture(state, [0x000000, 0xffffff], [1, 1], [0, 255]);
    expect(createTextureSpy).toHaveBeenCalledWith(expect.objectContaining({ size: [256, 1, 1] }));
    expect(writeTextureSpy).toHaveBeenCalled();
    expect(tex).toBeDefined();
  });

  it('returns a texture even for an empty gradient', async () => {
    const state = await makeFilterState();
    const tex = createWgpuGradientRampTexture(state, [], [], []);
    expect(tex).toBeDefined();
  });

  it('creates a texture for a multi-stop gradient', async () => {
    const state = await makeFilterState();
    const tex = createWgpuGradientRampTexture(state, [0xff0000, 0x00ff00, 0x0000ff], [1, 1, 1], [0, 128, 255]);
    expect(tex).toBeDefined();
  });
});

describe('destroyWgpuGradientRampTextures', () => {
  it('does not throw when called with no cached textures', async () => {
    const state = await makeFilterState();
    expect(() => destroyWgpuGradientRampTextures(state)).not.toThrow();
  });

  it('clears the cache so subsequent calls re-create textures', async () => {
    const state = await makeFilterState();
    const internalState = state as never as { device: { createTexture: ReturnType<typeof vi.fn> } };
    const createTextureSpy = vi.spyOn(internalState.device, 'createTexture');

    const first = getWgpuGradientRampTexture(state, [0x000000, 0xffffff], [1, 1], [0, 255]);
    expect(createTextureSpy).toHaveBeenCalledTimes(1);
    destroyWgpuGradientRampTextures(state);
    // After destroy the cache is cleared — a new texture is created for the same stops.
    const second = getWgpuGradientRampTexture(state, [0x000000, 0xffffff], [1, 1], [0, 255]);
    expect(createTextureSpy).toHaveBeenCalledTimes(2);
    expect(second).not.toBe(first);
  });

  it('is idempotent — double destroy does not throw', async () => {
    const state = await makeFilterState();
    getWgpuGradientRampTexture(state, [0x000000, 0xffffff], [1, 1], [0, 255]);
    destroyWgpuGradientRampTextures(state);
    expect(() => destroyWgpuGradientRampTextures(state)).not.toThrow();
  });
});

describe('getWgpuGradientRampTexture', () => {
  it('reuses the same texture for identical stops and does not rebuild it', async () => {
    const state = await makeFilterState();
    const internalState = state as never as { device: { createTexture: ReturnType<typeof vi.fn> } };
    const createTextureSpy = vi.spyOn(internalState.device, 'createTexture');

    const first = getWgpuGradientRampTexture(state, [0x000000, 0xffffff], [1, 1], [0, 255]);
    const second = getWgpuGradientRampTexture(state, [0x000000, 0xffffff], [1, 1], [0, 255]);
    expect(second).toBe(first);
    expect(createTextureSpy).toHaveBeenCalledTimes(1);
  });

  it('builds a distinct texture for different stops', async () => {
    const state = await makeFilterState();
    const a = getWgpuGradientRampTexture(state, [0x000000, 0xffffff], [1, 1], [0, 255]);
    const b = getWgpuGradientRampTexture(state, [0xff0000, 0x0000ff], [1, 1], [0, 255]);
    expect(b).not.toBe(a);
  });
});
