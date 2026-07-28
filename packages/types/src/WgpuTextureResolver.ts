import type { TextureLike } from './Texture';
import type { TextureBackingKind } from './TextureBackingKind';
import type { WgpuRenderState, WgpuTextureEntry } from './WgpuRenderState';

// Open string registry key declared by the backing itself. This backend-specific alias keeps the
// registerWgpuTextureResolver signature self-identifying while sharing the portable backing value.
export type WgpuTextureBackingKind = TextureBackingKind;

// Synchronously realizes a Texture for one render state. GPU handles stay in state-owned caches;
// null is the not-ready/unsupported sentinel.
export type WgpuTextureResolver = (
  state: WgpuRenderState,
  texture: Readonly<TextureLike>,
  premultiply: boolean,
) => WgpuTextureEntry | null;
