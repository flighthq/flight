import { describe, expect, it } from 'vitest';

import { createWgpuGradientRampTexture } from './wgpuGradientRamp';
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
