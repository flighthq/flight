import { emitSignal } from '@flighthq/signals/contract';
import { getTextureSourceKind } from '@flighthq/texture/contract';
import type { CanvasRenderState, CanvasTextureResolver, Texture, TextureSourceKind } from '@flighthq/types/contract';
import { RenderRegistry } from '@flighthq/types/contract';

import { getCanvasRenderStateRuntime } from './canvasRenderState';

export function registerCanvasTextureResolver(
  state: CanvasRenderState,
  sourceKind: TextureSourceKind,
  resolver: CanvasTextureResolver | null,
): void {
  const runtime = getCanvasRenderStateRuntime(state);
  const registry = (runtime.canvasTextureResolverRegistry ??= new Map());
  if (resolver === null) registry.delete(sourceKind);
  else registry.set(sourceKind, resolver);
}

export function resolveCanvasTexture(state: CanvasRenderState, texture: Readonly<Texture>): CanvasImageSource | null {
  if (texture.dimension !== '2d') return null;
  const sourceKind = getTextureSourceKind(texture);
  if (sourceKind === null) return null;
  const runtime = getCanvasRenderStateRuntime(state);
  const resolver = runtime.canvasTextureResolverRegistry?.get(sourceKind);
  if (resolver === undefined) {
    if (runtime.registrySignals !== null) {
      emitSignal(runtime.registrySignals.onRegistryMiss, RenderRegistry.TextureResolver, sourceKind);
    }
    return null;
  }
  return resolver(state, texture);
}
