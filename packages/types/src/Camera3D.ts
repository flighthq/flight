import type { Entity, EntityWithoutRuntime } from './Entity';
import type { Matrix4 } from './Matrix4';
import type { Plane } from './Plane';
import type { Vector2 } from './Vector2';

// 3D scene camera. Device media selection and capture live in the dialog capability group.
// `view` is the world->view Matrix4 (the inverse of the camera's world transform); `projection`
// is the discriminated perspective/orthographic/raw descriptor. `near`/`far` are the clip-plane
// distances. `jitter` is the per-frame sub-pixel NDC offset applied to every projection.
// `inverseViewProjection` is the last inverse projection×view computed by
// `updateCamera3DInverseViewProjection`; backend reconstruction passes refresh and consume it.
// `nearClipPlane`, when non-null, is a view-space plane that replaces the symmetric near clip
// plane via the Lengyel oblique technique — used for planar reflections so geometry behind the
// mirror is clipped. Applied automatically by every view-projection builder after jitter.
export interface Camera3D extends Entity {
  far: number;
  inverseViewProjection: Matrix4;
  jitter: Vector2;
  near: number;
  nearClipPlane: Plane | null;
  projection: Projection;
  view: Matrix4;
}

export type Camera3DLike = EntityWithoutRuntime<Camera3D>;

// Discriminated union of the supported projection models. Switch on `kind`.
export type Projection = OrthographicProjection | PerspectiveProjection | RawProjection;

// Perspective projection: a vertical field of view in radians and a viewport aspect ratio
// (width / height). The clip-plane distances live on the owning Camera3D (near/far).
export interface PerspectiveProjection extends Entity {
  aspect: number;
  fovY: number;
  kind: 'perspective';
}

// Orthographic projection: the half-extents of the view volume in view-space units. The full
// visible width is 2*halfWidth and height 2*halfHeight. Clip-plane distances live on the Camera3D.
export interface OrthographicProjection extends Entity {
  halfHeight: number;
  halfWidth: number;
  kind: 'orthographic';
}

// A pre-built projection matrix used verbatim. The system cannot derive FOV, aspect, or
// clip-plane distances from a raw matrix, so viewport-resize adaptation and `setCamera3DAspect`
// are no-ops. Jitter is still applied. `near`/`far` on Camera3D should match whatever the raw
// matrix encodes (depth linearization and shadow passes read them). Use for VR eye matrices,
// external projection sources, or any case where the projection is not describable as symmetric
// perspective or orthographic.
export interface RawProjection extends Entity {
  kind: 'raw';
  matrix: Matrix4;
}
