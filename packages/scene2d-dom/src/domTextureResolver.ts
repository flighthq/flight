import { getTextureSourceKind } from '@flighthq/texture/contract';
import type { DomRenderState, DomTextureResolver, Texture, TextureSourceKind } from '@flighthq/types/contract';
import { RenderRegistryTable } from '@flighthq/types/contract';

import { getDomRenderStateRuntime } from './domRenderState';

export function registerDomTextureResolver(
  state: DomRenderState,
  sourceKind: TextureSourceKind,
  resolver: DomTextureResolver | null,
): void {
  const runtime = getDomRenderStateRuntime(state);
  const table = runtime.registries.textureResolvers ?? new Map();
  const entries = new Map(table);
  if (resolver === null) entries.delete(sourceKind);
  else entries.set(sourceKind, resolver);
  runtime.registries.textureResolvers = entries;
}

export function resolveDomTexture(state: DomRenderState, texture: Readonly<Texture>): CanvasImageSource | null {
  if (texture.dimension !== '2d') return null;
  const sourceKind = getTextureSourceKind(texture);
  if (sourceKind === null) return null;
  const runtime = getDomRenderStateRuntime(state);
  const entry = runtime.registries.textureResolvers.get(sourceKind);
  if (entry == null) {
    runtime.registryMiss?.(RenderRegistryTable.TextureResolver, sourceKind);
    return null;
  }
  return entry(state, texture);
}
