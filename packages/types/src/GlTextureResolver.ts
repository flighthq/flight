import type { GlRenderState } from './GlRenderState';
import type { TextureColorSpace, TextureLike } from './Texture';

// Synchronously realizes and binds a Texture for one render state. GPU handles stay entirely in the
// state-owned caches reached by the resolver; null is the not-ready/unsupported sentinel.
export type GlTextureResolver = (
  state: GlRenderState,
  texture: Readonly<TextureLike>,
  premultiply: boolean,
  colorSpace: TextureColorSpace,
) => WebGLTexture | null;
