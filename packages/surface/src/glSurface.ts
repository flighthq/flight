import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  GlContext,
  GlContextOptions,
  GlSurface,
  HostGlCapability,
  HostTarget,
} from '@flighthq/types/contract';

export function createGlSurface(
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
