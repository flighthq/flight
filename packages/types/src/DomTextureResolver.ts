import type { DomRenderState } from './DomRenderState.ts';
import type { Texture } from './Texture.ts';

export type DomTextureResolver = (state: DomRenderState, texture: Readonly<Texture>) => CanvasImageSource | null;
