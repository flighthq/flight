import type { GlRenderState } from './GlRenderState';
import type { TextureLike } from './Texture';
import type { TextureStorage } from './TextureStorage';

// A backing-family matcher registered by identity. Matchers are evaluated newest-first, allowing a
// more specific opt-in backing (video/produced/vendor) to override the general image resolver
// without a closed switch in render-gl.
export type GlTextureBackingKind = (storage: Readonly<TextureStorage>) => boolean;

// Synchronously realizes and binds a Texture for one render state. GPU handles stay entirely in the
// state-owned caches reached by the resolver; null is the not-ready/unsupported sentinel.
export type GlTextureResolver = (state: GlRenderState, texture: Readonly<TextureLike>) => WebGLTexture | null;

export interface GlTextureResolverRegistration {
  backingKind: GlTextureBackingKind;
  resolver: GlTextureResolver;
}
