import { getTextureSourceKind } from '@flighthq/texture/contract';
import type { DomRenderState, DomTextureResolver, Texture, TextureSourceKind } from '@flighthq/types/contract';
import { RenderRegistry, RegistryEntryState } from '@flighthq/types/contract';

import { getDomRenderStateRuntime } from './domRenderState';

export function registerDomTextureResolver(
  state: DomRenderState,
  sourceKind: TextureSourceKind,
  resolver: DomTextureResolver | null,
): void {
  const runtime = getDomRenderStateRuntime(state);
  const table = runtime.registries.textureResolvers;
  const entries = new Map(table.entries);
  if (resolver === null) entries.delete(sourceKind);
  else entries.set(sourceKind, { state: RegistryEntryState.Bound, value: resolver });
  runtime.registries.textureResolvers = { ...table, entries };
}

export function resolveDomTexture(state: DomRenderState, texture: Readonly<Texture>): CanvasImageSource | null {
  if (texture.dimension !== '2d') return null;
  const sourceKind = getTextureSourceKind(texture);
  if (sourceKind === null) return null;
  const runtime = getDomRenderStateRuntime(state);
  const entry = runtime.registries.textureResolvers.entries.get(sourceKind);
  if (entry?.state !== RegistryEntryState.Bound) {
    runtime.registryMiss?.(RenderRegistry.TextureResolver, sourceKind);
    return null;
  }
  return entry.value(state, texture);
}
