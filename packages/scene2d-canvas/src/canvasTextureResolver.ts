import { getTextureSourceKind } from '@flighthq/texture/contract';
import type { CanvasRenderState, CanvasTextureResolver, Texture, TextureSourceKind } from '@flighthq/types/contract';

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
  const registry = getCanvasRenderStateRuntime(state).canvasTextureResolverRegistry;
  if (registry == null) return null;
  const sourceKind = getTextureSourceKind(texture);
  if (sourceKind === null) return null;
  return registry.get(sourceKind)?.(state, texture) ?? null;
}
