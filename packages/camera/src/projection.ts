import { setOrthographicMatrix4, setPerspectiveMatrix4 } from '@flighthq/geometry';
import type { Matrix4Like } from '@flighthq/types';
import type {
  OrthographicProjection,
  OrthographicProjectionOptions,
  PerspectiveProjection,
  PerspectiveProjectionOptions,
  Projection,
} from '@flighthq/types';

// Builds an orthographic projection descriptor from explicit view-volume half-extents (in
// view-space units). The full visible width is 2*halfWidth and height 2*halfHeight; the
// clip-plane distances live on the owning Camera3D, not the projection.
export function createOrthographicProjection(opts: Readonly<OrthographicProjectionOptions>): OrthographicProjection {
  return {
    halfHeight: opts.halfHeight,
    halfWidth: opts.halfWidth,
    kind: 'orthographic',
  };
}

// Builds a perspective projection descriptor from a vertical field of view (radians) and a
// viewport aspect ratio (width / height). The clip-plane distances live on the owning Camera3D.
export function createPerspectiveProjection(opts: Readonly<PerspectiveProjectionOptions>): PerspectiveProjection {
  return {
    aspect: opts.aspect ?? 1,
    fovY: opts.fovY,
    kind: 'perspective',
  };
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
    // Geometry's setPerspectiveMatrix4 takes the tangent of the half-FOV, not the full angle.
    const tanHalfFovY = Math.tan(projection.fovY * 0.5);
    setPerspectiveMatrix4(out, tanHalfFovY, aspect, near, far);
    return;
  }

  const halfWidth = projection.halfWidth;
  const halfHeight = projection.halfHeight;
  setOrthographicMatrix4(out, -halfWidth, halfWidth, -halfHeight, halfHeight, near, far);
}
