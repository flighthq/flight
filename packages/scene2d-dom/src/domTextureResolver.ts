import { getTextureBackingKind } from '@flighthq/texture/contract';
import type { DomRenderState, DomTextureResolver, Texture, TextureBackingKind } from '@flighthq/types/contract';

import { getDomRenderStateRuntime } from './domRenderState';

export function registerDomTextureResolver(
  state: DomRenderState,
  backingKind: TextureBackingKind,
  resolver: DomTextureResolver | null,
): void {
  const runtime = getDomRenderStateRuntime(state);
  const registry = (runtime.domTextureResolverRegistry ??= new Map());
  if (resolver === null) registry.delete(backingKind);
  else registry.set(backingKind, resolver);
}

export function resolveDomTexture(state: DomRenderState, texture: Readonly<Texture>): CanvasImageSource | null {
  if (texture.storage.dimension !== '2d') return null;
  const registry = getDomRenderStateRuntime(state).domTextureResolverRegistry;
  if (registry == null) return null;
  const backingKind = getTextureBackingKind(texture);
  if (backingKind === null) return null;
  return registry.get(backingKind)?.(state, texture) ?? null;
}
