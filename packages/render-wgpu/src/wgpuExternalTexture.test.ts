import { getTextureBackingKind } from '@flighthq/texture/contract';
import { ExternalTextureBackingKind } from '@flighthq/types/contract';

import { createExternalWgpuTexture, disposeExternalWgpuTexture } from './wgpuExternalTexture';
import { createWgpuRenderStateForTest, installWgpuMock } from './wgpuTestHelper';
import { resolveWgpuTexture } from './wgpuTextureResolver';

beforeAll(() => {
  installWgpuMock();
});

describe('external WGPU textures', () => {
  it('resolves a borrowed handle and forgets it without destroying the allocation', async () => {
    const state = await createWgpuRenderStateForTest();
    const destroy = vi.fn();
    const handle = { createView: vi.fn(() => ({})), destroy } as unknown as GPUTexture;
    const texture = createExternalWgpuTexture(state, handle, { height: 16, width: 32 });

    expect(getTextureBackingKind(texture)).toBe(ExternalTextureBackingKind);
    expect(resolveWgpuTexture(state, texture)?.texture).toBe(handle);
    expect(disposeExternalWgpuTexture(state, texture)).toBe(true);
    expect(resolveWgpuTexture(state, texture)).toBeNull();
    expect(destroy).not.toHaveBeenCalled();
  });
});
