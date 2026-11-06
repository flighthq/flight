import type { EntityRaw, EntityRuntime, EntityRuntimeKey, EntityWithoutRuntime } from '@flighthq/entity/contract';
import type { Matrix4, Matrix4Like, Plane, Rectangle, Vector2 } from '@flighthq/geometry/contract';

// 2D game-camera header. `@flighthq/camera` operates on this plain-data camera to produce the
// world<->screen transform, follow a target with a deadzone and frame-rate-independent smoothing,
// clamp to world bounds, compute parallax-layer offsets, and report the visible world rectangle for
// culling. `(x, y)` is the world point rendered at the CENTER of the viewport; `zoom` > 1 magnifies
// and `rotation` is in radians, counter-clockwise about the center.
export interface Camera2D extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  rotation: number;
  x: number;
  y: number;
  zoom: number;
}

// Optional target-follow parameters. The deadzone fields are world-unit half-extents, smoothTime is
// the exponential-smoothing time constant in seconds, and worldBounds constrains the visible view.
export interface Camera2DFollowOptions {
  deadzoneHalfHeight?: number;
  deadzoneHalfWidth?: number;
  smoothTime?: number;
  worldBounds?: Readonly<Rectangle>;
}

// Optional overrides for createCamera2D. Omitted fields take their identity defaults.
export interface Camera2DOptions {
  rotation?: number;
  x?: number;
  y?: number;
  zoom?: number;
}

// 3D scene camera. `view` is the world->view Matrix4; `projection` is the discriminated
// perspective/orthographic/raw descriptor. `nearClipPlane`, when non-null, replaces the symmetric
// near clip plane through the Lengyel oblique technique for planar reflections.
export interface Camera3D extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  far: number;
  inverseViewProjection: Matrix4;
  jitter: Vector2;
  near: number;
  nearClipPlane: Plane | null;
  projection: Projection;
  view: Matrix4;
}

export type Camera3DLike = EntityWithoutRuntime<Camera3D>;

// Structural inputs for createCamera3D.
export interface Camera3DOptions {
  far: number;
  near: number;
  nearClipPlane?: Plane | null;
  projection: Projection;
}

export interface Camera3DViewExplanation {
  /** Determinant of the upper 3x3. +1 for a rigid basis, -1 for a reflection. */
  determinant: number;
  /** True when the basis is orthonormal within tolerance. */
  isOrthonormal: boolean;
  /** True when the basis is orthogonal but mirrored. */
  isReflection: boolean;
  /** Largest absolute deviation from unit length across the three basis vectors. */
  scaleDeviation: number;
  /** Largest absolute pairwise dot product between the three basis vectors. */
  shearDeviation: number;
}

// Discriminated union of the supported projection models. Switch on `kind`.
export type Projection = OrthographicProjection | PerspectiveProjection | RawProjection;

// Perspective projection: vertical field of view in radians and viewport aspect ratio.
export interface PerspectiveProjection extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  aspect: number;
  fovY: number;
  kind: 'perspective';
}

// Structural inputs for createPerspectiveProjection. `aspect` defaults to 1.
export interface PerspectiveProjectionOptions {
  aspect?: number;
  fovY: number;
}

// Orthographic projection: half-extents of the view volume in view-space units.
export interface OrthographicProjection extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  halfHeight: number;
  halfWidth: number;
  kind: 'orthographic';
}

// Structural inputs for createOrthographicProjection.
export interface OrthographicProjectionOptions {
  halfHeight: number;
  halfWidth: number;
}

// A pre-built projection matrix used verbatim. Use for VR eye matrices or external projections.
export interface RawProjection extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  kind: 'raw';
  matrix: Matrix4;
}

// Structural inputs for createRawProjection. The matrix is copied, not referenced.
export interface RawProjectionOptions {
  matrix: Readonly<Matrix4Like>;
}
