import { createEntity } from '@flighthq/entity/contract';
import { getRenderStateRuntime } from '@flighthq/render/contract';
import { getTextureSourceKind } from '@flighthq/texture/contract';
import type {
  CanvasTextureResolver,
  CanvasTextureResolvers,
  CanvasRenderSurface,
  CanvasRenderSurfaceCreator,
  CanvasRenderSurfaceOptions,
  RenderState,
  Texture,
  TextureSourceKind,
} from '@flighthq/types/contract';
import { EntityRuntimeKey, RenderRegistry } from '@flighthq/types/contract';

import { acquireCanvasRenderSurface, destroyCanvasRenderSurface } from './canvasRenderSurface';

export function acquireCanvasTextureResolverSurface(
  resolvers: CanvasTextureResolvers,
  options: Readonly<CanvasRenderSurfaceOptions>,
): CanvasRenderSurface | null {
  const surface = acquireCanvasRenderSurface(resolvers.surfaceCreator, options);
  if (surface !== null) _ownedSurfaces.get(resolvers)?.add(surface);
  return surface;
}

// Points a resolution set's miss seam at a render state's emitter, so misses it reports arrive through
// the diagnostics the caller already enabled on that state.
//
// A set owned by a CanvasRenderState is wired to its own state at creation and needs none of this. The
// case this exists for is the OTHER one the type is designed around: a set built for a DOM or GPU
// backend's shape rasterizer, which belongs to no canvas of its own. Nothing wires that set, so a
// texture source it cannot resolve goes unreported — the fill silently does not paint, on a state whose
// guards are enabled and reporting everything else. Registering the rasterizer is what declares the
// capability; this is what makes the capability's own gaps visible.
//
// The closure reads the emitter at call time, so the order against enabling guards does not matter.
export function connectCanvasTextureResolverMisses(resolvers: CanvasTextureResolvers, state: RenderState): void {
  const runtime = getRenderStateRuntime(state);
  resolvers.registryMiss = (registry, kind) => runtime.registryMiss?.(registry, kind);
}

// A fresh, empty resolution set. Nothing is registered: what a set can resolve is exactly what the
// caller installs on it, which is what makes a rasterizer's capability inspectable rather than implied.
export function createCanvasTextureResolvers(
  surfaceCreator: Readonly<CanvasRenderSurfaceCreator>,
): CanvasTextureResolvers {
  const resolvers = createEntity({ registry: null, registryMiss: null, surfaceCreator }) as CanvasTextureResolvers;
  resolvers[EntityRuntimeKey] = { binding: null, uid: null };
  _ownedSurfaces.set(resolvers, new Set());
  return resolvers;
}

export function destroyCanvasTextureResolvers(resolvers: CanvasTextureResolvers): void {
  const surfaces = _ownedSurfaces.get(resolvers);
  if (surfaces === undefined) return;
  _ownedSurfaces.delete(resolvers);
  for (const surface of surfaces) destroyCanvasRenderSurface(surface);
  surfaces.clear();
  resolvers.registry?.clear();
  resolvers.registry = null;
  resolvers.registryMiss = null;
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

const _ownedSurfaces = new WeakMap<CanvasTextureResolvers, Set<CanvasRenderSurface>>();
