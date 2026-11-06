import type { Texture } from '@flighthq/texture/contract';

import type { DomRenderState } from './DomRenderState.ts';

export type DomTextureResolver = (state: DomRenderState, texture: Readonly<Texture>) => CanvasImageSource | null;
