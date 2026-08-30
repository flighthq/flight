import { getTextureSourceKind } from '@flighthq/texture/contract';
import { ExternalTextureSourceKind } from '@flighthq/types/contract';

import { createExternalGlTexture, disposeExternalGlTexture } from './glExternalTexture';
import { getGlRenderStateRuntime } from './glRenderState';
import { createGlState } from './glTestHelper';
import { resolveGlTexture } from './glTextureResolver';

describe('createExternalGlTexture', () => {
  it('replaces a prior straight-alpha texture shadow atomically', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    runtime.context.currentTextureRealization = { straightAlpha: true, texture: state.gl.createTexture()! };
    const handle = state.gl.createTexture()!;
    const texture = createExternalGlTexture(state, handle, { height: 16, width: 32 });

    expect(resolveGlTexture(state, texture, true, 'srgb')).toBe(handle);
    expect(runtime.context.currentTextureRealization?.texture).toBe(handle);
    expect(runtime.context.currentTextureRealization?.straightAlpha).toBe(false);
  });

  it('resolves a borrowed handle and forgets it without deleting the allocation', () => {
    const { state } = createGlState();
    const handle = state.gl.createTexture()!;
    const deleteTexture = vi.spyOn(state.gl, 'deleteTexture');
    const texture = createExternalGlTexture(state, handle, { height: 16, width: 32 });

    expect(getTextureSourceKind(texture)).toBe(ExternalTextureSourceKind);
    expect(resolveGlTexture(state, texture)).toBe(handle);
    expect(disposeExternalGlTexture(state, texture)).toBe(true);
    expect(resolveGlTexture(state, texture)).toBeNull();
    expect(deleteTexture).not.toHaveBeenCalled();
  });
});

describe('disposeExternalGlTexture', () => {
  it('returns false after the borrowed handle has already been forgotten', () => {
    const { state } = createGlState();
    const texture = createExternalGlTexture(state, state.gl.createTexture()!, { height: 1, width: 1 });
    expect(disposeExternalGlTexture(state, texture)).toBe(true);
    expect(disposeExternalGlTexture(state, texture)).toBe(false);
  });
});
