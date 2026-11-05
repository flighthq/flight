import type { TextureColorSpace, TextureLike } from './Texture.ts';
import type { WgpuRenderState, WgpuTextureEntry } from './WgpuRenderState.ts';

// Synchronously realizes a Texture for one render state. GPU handles stay in state-owned caches;
// null is the not-ready/unsupported sentinel.
export type WgpuTextureResolver = (
  state: WgpuRenderState,
  texture: Readonly<TextureLike>,
  premultiply: boolean,
  colorSpace: TextureColorSpace,
) => WgpuTextureEntry | null;
