import type { DomRenderState } from './DomRenderState';
import type { Texture } from './Texture';

export type DomTextureResolver = (state: DomRenderState, texture: Readonly<Texture>) => CanvasImageSource | null;
