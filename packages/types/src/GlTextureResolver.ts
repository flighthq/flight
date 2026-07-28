import type { GlRenderState } from './GlRenderState';
import type { TextureLike } from './Texture';
import type { TextureBackingKind } from './TextureBackingKind';

// Open string registry key declared by the backing itself. This backend-specific alias keeps the
// registerGlTextureResolver signature self-identifying while sharing the portable backing value.
export type GlTextureBackingKind = TextureBackingKind;

// Synchronously realizes and binds a Texture for one render state. GPU handles stay entirely in the
// state-owned caches reached by the resolver; null is the not-ready/unsupported sentinel.
export type GlTextureResolver = (state: GlRenderState, texture: Readonly<TextureLike>) => WebGLTexture | null;
