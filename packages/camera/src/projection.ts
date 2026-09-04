import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { setOrthographicMatrix4, setPerspectiveMatrix4 } from '@flighthq/geometry/contract';
import type { Entity, Matrix4Like } from '@flighthq/types/contract';
import type {
  OrthographicProjection,
  OrthographicProjectionOptions,
  PerspectiveProjection,
  PerspectiveProjectionOptions,
  Projection,
} from '@flighthq/types/contract';

// Builds an orthographic projection descriptor from explicit view-volume half-extents (in
// view-space units). The full visible width is 2*halfWidth and height 2*halfHeight; the
// clip-plane distances live on the owning Camera3D, not the projection.
export function createOrthographicProjection(
  opts: Readonly<OrthographicProjectionOptions>,
): OrthographicProjection & Entity {
  const out = allocateEntity<OrthographicProjection>();
  out.halfHeight = opts.halfHeight;
  out.halfWidth = opts.halfWidth;
  out.kind = 'orthographic';
  return finishEntity(out);
}

// Builds a perspective projection descriptor from a vertical field of view (radians) and a
// viewport aspect ratio (width / height). The clip-plane distances live on the owning Camera3D.
export function createPerspectiveProjection(
  opts: Readonly<PerspectiveProjectionOptions>,
): PerspectiveProjection & Entity {
  const out = allocateEntity<PerspectiveProjection>();
  out.aspect = opts.aspect ?? 1;
  out.fovY = opts.fovY;
  out.kind = 'perspective';
  return finishEntity(out);
}

// Returns the larger world-space footprint of one texel across an orthographic projection. Using the
// larger axis gives receiver offsets one conservative, aspect-independent unit even when the shadow
// map or light projection is not square. `pixelWidth`/`pixelHeight` must be positive.
export function getOrthographicProjectionTexelSize(
  projection: Readonly<OrthographicProjection>,
  pixelWidth: number,
  pixelHeight: number,
): number {
  return Math.max((projection.halfWidth * 2) / pixelWidth, (projection.halfHeight * 2) / pixelHeight);
}

// True when the projection is an orthographic descriptor. Narrows the discriminated union.
export function isOrthographicProjection(projection: Readonly<Projection>): projection is OrthographicProjection {
  return projection.kind === 'orthographic';
}

// True when the projection is a perspective descriptor. Narrows the discriminated union.
export function isPerspectiveProjection(projection: Readonly<Projection>): projection is PerspectiveProjection {
  return projection.kind === 'perspective';
}

// Writes the projection matrix for `projection` into `out`, delegating to geometry's perspective
// or orthographic builders. `aspect` (viewport width / height) overrides a perspective
// projection's stored aspect so a single descriptor can drive a resizing viewport; it is ignored
// for orthographic projections, whose half-extents are explicit. `near`/`far` are the clip-plane
// distances supplied by the owning Camera3D.
//
// Reads the projection fields into locals before writing `out`, so it is safe even if `out`
// aliases a matrix referenced elsewhere.
export function setProjectionMatrix4(
  out: Matrix4Like,
  projection: Readonly<Projection>,
  aspect: number,
  near: number,
  far: number,
): void {
  if (projection.kind === 'perspective') {
    setPerspectiveMatrix4(out, Math.tan(projection.fovY * 0.5), aspect, near, far);
    return;
  }

  const halfWidth = projection.halfWidth;
  const halfHeight = projection.halfHeight;
  setOrthographicMatrix4(out, -halfWidth, halfWidth, -halfHeight, halfHeight, near, far);
}
