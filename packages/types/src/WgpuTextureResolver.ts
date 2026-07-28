import type { TextureLike } from './Texture';
import type { WgpuRenderState, WgpuTextureEntry } from './WgpuRenderState';

// Synchronously realizes a Texture for one render state. GPU handles stay in state-owned caches;
// null is the not-ready/unsupported sentinel.
export type WgpuTextureResolver = (
  state: WgpuRenderState,
  texture: Readonly<TextureLike>,
  premultiply: boolean,
) => WgpuTextureEntry | null;
