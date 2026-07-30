import { getTextureSourceKind } from '@flighthq/texture/contract';
import type { DomRenderState, DomTextureResolver, Texture, TextureSourceKind } from '@flighthq/types/contract';

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
  if (texture.storage.dimension !== '2d') return null;
  const registry = getDomRenderStateRuntime(state).domTextureResolverRegistry;
  if (registry == null) return null;
  const sourceKind = getTextureSourceKind(texture);
  if (sourceKind === null) return null;
  return registry.get(sourceKind)?.(state, texture) ?? null;
}
