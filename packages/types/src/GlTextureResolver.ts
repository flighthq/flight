import type { GlRenderState } from './GlRenderState';
import type { TextureColorSpace, TextureLike } from './Texture';

// The backend handle and the sample interpretation that must travel with it. Keeping both facts in
// one value prevents a newly bound handle from inheriting the previous texture's alpha treatment.
export interface GlTextureRealization {
  readonly straightAlpha: boolean;
  readonly texture: WebGLTexture;
}

// Synchronously realizes a Texture for one render state. GPU handles stay entirely in the state-owned
// caches reached by the resolver; null is the not-ready/unsupported sentinel. resolveGlTexture owns
// the final bind and atomically publishes the returned realization to the context binding shadow.
export type GlTextureResolver = (
  state: GlRenderState,
  texture: Readonly<TextureLike>,
  premultiply: boolean,
  colorSpace: TextureColorSpace,
) => GlTextureRealization | null;
