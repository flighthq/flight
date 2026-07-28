import { getTextureBackingKind } from '@flighthq/texture/contract';
import { ExternalTextureBackingKind } from '@flighthq/types/contract';

import { createExternalGlTexture, disposeExternalGlTexture } from './glExternalTexture';
import { createGlState } from './glTestHelper';
import { resolveGlTexture } from './glTextureResolver';

describe('external GL textures', () => {
  it('resolves a borrowed handle and forgets it without deleting the allocation', () => {
    const { state } = createGlState();
    const handle = state.gl.createTexture()!;
    const deleteTexture = vi.spyOn(state.gl, 'deleteTexture');
    const texture = createExternalGlTexture(state, handle, { height: 16, width: 32 });

    expect(getTextureBackingKind(texture)).toBe(ExternalTextureBackingKind);
    expect(resolveGlTexture(state, texture)).toBe(handle);
    expect(disposeExternalGlTexture(state, texture)).toBe(true);
    expect(resolveGlTexture(state, texture)).toBeNull();
    expect(deleteTexture).not.toHaveBeenCalled();
  });
});
