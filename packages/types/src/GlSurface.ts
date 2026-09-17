import type { Entity } from './Entity';
import type { GlContext } from './GlContext';
import type { HostTarget } from './HostTarget';

// A GL rendering surface: the binding of a HostTarget to an acquired WebGL 2 context. Created by
// createGlSurface, which acquires the context through HostGlCapability and bundles it with the
// target identity. The target's backing store dimensions are a host concern — the context reads
// them live through drawingBufferWidth/drawingBufferHeight.
export interface GlSurface extends Entity {
  readonly __brand: 'GlSurface';
  readonly context: GlContext;
  readonly target: HostTarget;
}
