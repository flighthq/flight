import type { CanvasRenderState, RenderTexture, Texture } from '@flighthq/types/contract';
import { RenderTargetTextureSourceKind } from '@flighthq/types/contract';

import { bindCanvasRenderTexture } from './canvasRenderTexture';
import { registerCanvasTextureResolver } from './canvasTextureResolver';

export function registerCanvasRenderTextureResolver(state: CanvasRenderState): void {
  registerCanvasTextureResolver(state, RenderTargetTextureSourceKind, resolveCanvasRenderTexture);
}

function resolveCanvasRenderTexture(state: CanvasRenderState, texture: Readonly<Texture>): CanvasImageSource | null {
  return bindCanvasRenderTexture(state, texture as Readonly<RenderTexture>);
}
