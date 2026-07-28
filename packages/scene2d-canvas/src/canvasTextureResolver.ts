import { getTextureBackingKind } from '@flighthq/texture/contract';
import type { CanvasRenderState, CanvasTextureResolver, Texture, TextureBackingKind } from '@flighthq/types/contract';

import { getCanvasRenderStateRuntime } from './canvasRenderState';

export function registerCanvasTextureResolver(
  state: CanvasRenderState,
  backingKind: TextureBackingKind,
  resolver: CanvasTextureResolver | null,
): void {
  const runtime = getCanvasRenderStateRuntime(state);
  const registry = (runtime.canvasTextureResolverRegistry ??= new Map());
  if (resolver === null) registry.delete(backingKind);
  else registry.set(backingKind, resolver);
}

export function resolveCanvasTexture(state: CanvasRenderState, texture: Readonly<Texture>): CanvasImageSource | null {
  if (texture.storage.dimension !== '2d') return null;
  const registry = getCanvasRenderStateRuntime(state).canvasTextureResolverRegistry;
  if (registry == null) return null;
  const backingKind = getTextureBackingKind(texture);
  if (backingKind === null) return null;
  return registry.get(backingKind)?.(state, texture) ?? null;
}
