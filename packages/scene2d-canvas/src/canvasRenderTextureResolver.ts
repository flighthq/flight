import type { CanvasRenderState, CanvasTextureResolvers, RenderTexture, Texture } from '@flighthq/types/contract';
import { RenderTargetTextureSourceKind } from '@flighthq/types/contract';

import { bindCanvasRenderTexture } from './canvasRenderTexture';
import { registerCanvasTextureResolver } from './canvasTextureResolver';

// The one resolver that needs a render state: a render-target texture is owned by the state that draws
// into it, so the state is captured here at registration rather than demanded of every resolution.
export function registerCanvasRenderTextureResolver(resolvers: CanvasTextureResolvers, state: CanvasRenderState): void {
  registerCanvasTextureResolver(resolvers, RenderTargetTextureSourceKind, (_resolvers, texture: Readonly<Texture>) =>
    bindCanvasRenderTexture(state, texture as Readonly<RenderTexture>),
  );
}
