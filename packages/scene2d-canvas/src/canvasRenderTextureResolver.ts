import type { CanvasRenderState, Texture } from '@flighthq/types/contract';
import { RenderTextureBackingKind } from '@flighthq/types/contract';

import { bindCanvasRenderTexture } from './canvasRenderTexture';
import { registerCanvasTextureResolver } from './canvasTextureResolver';

export function registerCanvasRenderTextureResolver(state: CanvasRenderState): void {
  registerCanvasTextureResolver(state, RenderTextureBackingKind, resolveCanvasRenderTexture);
}

function resolveCanvasRenderTexture(state: CanvasRenderState, texture: Readonly<Texture>): CanvasImageSource | null {
  return bindCanvasRenderTexture(state, texture);
}
