import type { CanvasRenderState } from './CanvasRenderState';
import type { Texture } from './Texture';

export type CanvasTextureResolver = (state: CanvasRenderState, texture: Readonly<Texture>) => CanvasImageSource | null;
