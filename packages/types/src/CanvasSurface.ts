import type { Entity } from './Entity';
import type { HostTarget } from './HostTarget';

// A Canvas 2D rendering surface: the binding of a HostTarget to a 2D rendering context. Created
// by createCanvasSurface, which acquires the CanvasRenderingContext2D from the target's underlying
// drawable and bundles it with the target identity.
export interface CanvasSurface extends Entity {
  readonly __brand: 'CanvasSurface';
  readonly context: CanvasRenderingContext2D;
  readonly target: HostTarget;
}
