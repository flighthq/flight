import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  GlContext,
  GlContextOptions,
  GlSurface,
  HostGlCapability,
  HostTarget,
} from '@flighthq/types/contract';

// Allocates a drawable of the given backing-store size in device pixels and acquires a GL context on it.
// The host owns the drawable; `surface.target` is its identity, and is what input, resize, and
// presentation are addressed to. Returns null when the host cannot provide GL.
export function createGlSurface(
  capability: Readonly<HostGlCapability>,
  width: number,
  height: number,
  options?: Readonly<GlContextOptions>,
): GlSurface | null {
  const target = capability.create(width, height, options);
  if (target === null) return null;
  return createGlSurfaceFromTarget(capability, target, options);
}

// Acquires a GL context on a target the host already holds — an adopted native window or element. The
// caller keeps ownership of the drawable; destroyGlSurface releases the context, never the drawable.
export function createGlSurfaceFromTarget(
  capability: Readonly<HostGlCapability>,
  target: HostTarget,
  options?: Readonly<GlContextOptions>,
): GlSurface | null {
  const context = capability.acquire(target, options);
  if (context === null) return null;
  const surface = allocateEntity<GlSurface>();
  initializeGlSurface(surface, target, context);
  return finishEntity(surface);
}

export function destroyGlSurface(capability: Readonly<HostGlCapability>, surface: Readonly<GlSurface>): void {
  capability.release(surface.target);
}

function initializeGlSurface(surface: EntityConstruction<GlSurface>, target: HostTarget, context: GlContext): void {
  surface.__brand = 'GlSurface' as const;
  surface.context = context;
  surface.target = target;
}
