import type { CanvasRenderState } from './CanvasRenderState';
import type { Texture } from './Texture';
import type { TextureBackingKind } from './TextureBackingKind';

// Backend-specific alias keeps registerCanvasTextureResolver self-identifying while sharing the
// portable backing-kind value with the other renderers.
export type CanvasTextureBackingKind = TextureBackingKind;

export type CanvasTextureResolver = (state: CanvasRenderState, texture: Readonly<Texture>) => CanvasImageSource | null;
