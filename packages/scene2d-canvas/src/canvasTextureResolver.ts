import { getTextureSourceKind } from '@flighthq/texture/contract';
import type {
  CanvasTextureResolver,
  CanvasTextureResolvers,
  Texture,
  TextureSourceKind,
} from '@flighthq/types/contract';
import { RenderRegistry } from '@flighthq/types/contract';

// A fresh, empty resolution set. Nothing is registered: what a set can resolve is exactly what the
// caller installs on it, which is what makes a rasterizer's capability inspectable rather than implied.
export function createCanvasTextureResolvers(): CanvasTextureResolvers {
  return { registry: null, registryMiss: null };
}

export function registerCanvasTextureResolver(
  resolvers: CanvasTextureResolvers,
  sourceKind: TextureSourceKind,
  resolver: CanvasTextureResolver | null,
): void {
  const registry = (resolvers.registry ??= new Map());
  if (resolver === null) registry.delete(sourceKind);
  else registry.set(sourceKind, resolver);
}

export function resolveCanvasTexture(
  resolvers: CanvasTextureResolvers,
  texture: Readonly<Texture>,
): CanvasImageSource | null {
  if (texture.dimension !== '2d') return null;
  const sourceKind = getTextureSourceKind(texture);
  if (sourceKind === null) return null;
  const resolver = resolvers.registry?.get(sourceKind);
  if (resolver === undefined) {
    resolvers.registryMiss?.(RenderRegistry.TextureResolver, sourceKind);
    return null;
  }
  return resolver(resolvers, texture);
}
