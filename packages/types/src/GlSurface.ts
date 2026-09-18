import type { GlContext } from './GlContext';
import type { Surface } from './HostTarget';

// A GL rendering surface: the binding of a target to an acquired GL context. Created by createGlSurface,
// which allocates the drawable through HostGlCapability, or by createGlSurfaceFromTarget for a target the
// host already holds. The backing store dimensions are deliberately absent — they are a host concern, and
// the context reads them live through drawingBufferWidth/drawingBufferHeight, so no field here can go
// stale against a resize.
export interface GlSurface extends Surface {
  readonly __brand: 'GlSurface';
  readonly context: GlContext;
}
