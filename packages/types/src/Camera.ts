import type { Entity, EntityWithoutRuntime } from './Entity';
import type { Matrix4 } from './Matrix4';
import type { Vector2 } from './Vector2';

// 3D camera. (The device/photo seam is `Webcam`, freeing this name for the scene camera.)
// `view` is the world->view Matrix4 (the inverse of the camera's world transform); `projection`
// is the discriminated perspective/orthographic descriptor. `near`/`far` are the clip-plane
// distances. `jitter` is the per-frame sub-pixel NDC offset TAA applies to projection.
// `inverseViewProjection` is the cached inverse of projection×view, consumed by the existing
// TAA / velocity / fog / depth-of-field effects; it is recomputed whenever view or projection
// changes.
export interface Camera extends Entity {
  far: number;
  inverseViewProjection: Matrix4;
  jitter: Vector2;
  near: number;
  projection: Projection;
  view: Matrix4;
}

export type CameraLike = EntityWithoutRuntime<Camera>;

// Discriminated union of the supported projection models. Switch on `kind`.
export type Projection = OrthographicProjection | PerspectiveProjection;

// Perspective projection: a vertical field of view in radians and a viewport aspect ratio
// (width / height). The clip-plane distances live on the owning Camera (near/far).
export interface PerspectiveProjection {
  aspect: number;
  fovY: number;
  kind: 'perspective';
}

// Orthographic projection: the half-extents of the view volume in view-space units. The full
// visible width is 2*halfWidth and height 2*halfHeight. Clip-plane distances live on the Camera.
export interface OrthographicProjection {
  halfHeight: number;
  halfWidth: number;
  kind: 'orthographic';
}
