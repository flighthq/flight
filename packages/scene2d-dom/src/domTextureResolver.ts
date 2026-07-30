import { emitSignal } from '@flighthq/signals/contract';
import { getTextureSourceKind } from '@flighthq/texture/contract';
import type { DomRenderState, DomTextureResolver, Texture, TextureSourceKind } from '@flighthq/types/contract';
import { RenderRegistry } from '@flighthq/types/contract';

import { getDomRenderStateRuntime } from './domRenderState';

export function registerDomTextureResolver(
  state: DomRenderState,
  sourceKind: TextureSourceKind,
  resolver: DomTextureResolver | null,
): void {
  const runtime = getDomRenderStateRuntime(state);
  const registry = (runtime.domTextureResolverRegistry ??= new Map());
  if (resolver === null) registry.delete(sourceKind);
  else registry.set(sourceKind, resolver);
}

export function resolveDomTexture(state: DomRenderState, texture: Readonly<Texture>): CanvasImageSource | null {
  if (texture.dimension !== '2d') return null;
  const sourceKind = getTextureSourceKind(texture);
  if (sourceKind === null) return null;
  const runtime = getDomRenderStateRuntime(state);
  const resolver = runtime.domTextureResolverRegistry?.get(sourceKind);
  if (resolver === undefined) {
    if (runtime.registrySignals !== null) {
      emitSignal(runtime.registrySignals.onRegistryMiss, RenderRegistry.TextureResolver, sourceKind);
    }
    return null;
  }
  return resolver(state, texture);
}
