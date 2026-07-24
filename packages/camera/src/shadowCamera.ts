import type { AabbLike, Camera3D, Vector3Like } from '@flighthq/types';

import { setCamera3DViewMatrix4FromLookAt } from './camera';
import { createOrthographicProjection } from './projection';

// Configures `camera` as the shadow camera for a directional light — the spec's "a shadow camera is
// just a Camera3D placed at the light." Looks along `lightDirection` (the light's travel direction) at
// the centre of `sceneBounds`, with an orthographic frustum sized to the scene's bounding sphere so the
// whole scene fits the shadow map. The render side then draws scene depth from this camera into the
// shadow map and samples it during shading.
//
// Backend-agnostic CPU math (no GL). `lightDirection` need not be normalized. A degenerate (single
// point) bounds falls back to unit radius so the frustum stays valid.
export function configureDirectionalShadowCamera3D(
  camera: Camera3D,
  lightDirection: Readonly<Vector3Like>,
  sceneBounds: Readonly<AabbLike>,
): void {
  const min = sceneBounds.min;
  const max = sceneBounds.max;
  const cx = (min.x + max.x) * 0.5;
  const cy = (min.y + max.y) * 0.5;
  const cz = (min.z + max.z) * 0.5;

  let radius = Math.hypot(max.x - cx, max.y - cy, max.z - cz);
  if (radius === 0) radius = 1;

  const dl = Math.hypot(lightDirection.x, lightDirection.y, lightDirection.z) || 1;
  const dx = lightDirection.x / dl;
  const dy = lightDirection.y / dl;
  const dz = lightDirection.z / dl;

  // Pull the eye back two radii along -lightDirection so the whole sphere sits in front of the camera.
  const distance = radius * 2;
  _eye.x = cx - dx * distance;
  _eye.y = cy - dy * distance;
  _eye.z = cz - dz * distance;
  _target.x = cx;
  _target.y = cy;
  _target.z = cz;
  // A near-vertical light needs a non-parallel up vector.
  const up = Math.abs(dy) > 0.99 ? _upZ : _upY;

  setCamera3DViewMatrix4FromLookAt(camera, _eye, _target, up);
  camera.near = radius; // distance - radius
  camera.far = radius * 3; // distance + radius
  camera.projection = createOrthographicProjection({ halfHeight: radius, halfWidth: radius });
}

// Configures a directional-light shadow camera with a tight light-space fit of `worldBounds`.
// Unlike configureDirectionalShadowCamera3D's rotation-stable bounding sphere, this transforms all
// eight world-AABB corners into the light view and independently fits the orthographic X/Y extents,
// preserving substantially more texel density for a large static architectural scene. `padding`
// multiplies every fitted half-extent (default 1); callers can raise it to absorb animated pose
// excursions outside bind-pose aggregate bounds.
//
// A tight fit of static whole-scene world bounds is stable. Re-fitting per-frame visible bounds
// requires texel snapping to avoid shimmering and is intentionally a separate, caller-composed pass.
export function configureDirectionalShadowCamera3DTightFit(
  camera: Camera3D,
  lightDirection: Readonly<Vector3Like>,
  worldBounds: Readonly<AabbLike>,
  padding = 1,
): void {
  const min = worldBounds.min;
  const max = worldBounds.max;
  const hasBounds = min.x <= max.x && min.y <= max.y && min.z <= max.z;
  const cx = hasBounds ? (min.x + max.x) * 0.5 : 0;
  const cy = hasBounds ? (min.y + max.y) * 0.5 : 0;
  const cz = hasBounds ? (min.z + max.z) * 0.5 : 0;
  const ex = hasBounds ? (max.x - min.x) * 0.5 : 1;
  const ey = hasBounds ? (max.y - min.y) * 0.5 : 1;
  const ez = hasBounds ? (max.z - min.z) * 0.5 : 1;
  const radius = Math.max(Math.hypot(ex, ey, ez), 1e-4);
  const extentScale = padding > 0 ? padding : 1;

  let dx = lightDirection.x;
  let dy = lightDirection.y;
  let dz = lightDirection.z;
  const directionLength = Math.hypot(dx, dy, dz);
  if (directionLength > 0) {
    dx /= directionLength;
    dy /= directionLength;
    dz /= directionLength;
  } else {
    dx = 0;
    dy = -1;
    dz = 0;
  }

  // Pull back far enough that even padded depth extents remain in front of the camera. Translation
  // along the view direction does not change the tight X/Y fit.
  const distance = Math.max(radius * 2 * extentScale, 1);
  _eye.x = cx - dx * distance;
  _eye.y = cy - dy * distance;
  _eye.z = cz - dz * distance;
  _target.x = cx;
  _target.y = cy;
  _target.z = cz;
  setCamera3DViewMatrix4FromLookAt(camera, _eye, _target, Math.abs(dy) > 0.99 ? _upZ : _upY);

  const view = camera.view.m;
  let halfWidth = 0;
  let halfHeight = 0;
  let minViewZ = Number.POSITIVE_INFINITY;
  let maxViewZ = Number.NEGATIVE_INFINITY;
  for (let corner = 0; corner < 8; corner++) {
    const x = (corner & 1) === 0 ? cx - ex : cx + ex;
    const y = (corner & 2) === 0 ? cy - ey : cy + ey;
    const z = (corner & 4) === 0 ? cz - ez : cz + ez;
    const viewX = view[0] * x + view[4] * y + view[8] * z + view[12];
    const viewY = view[1] * x + view[5] * y + view[9] * z + view[13];
    const viewZ = view[2] * x + view[6] * y + view[10] * z + view[14];
    halfWidth = Math.max(halfWidth, Math.abs(viewX));
    halfHeight = Math.max(halfHeight, Math.abs(viewY));
    minViewZ = Math.min(minViewZ, viewZ);
    maxViewZ = Math.max(maxViewZ, viewZ);
  }

  const depthCenter = (minViewZ + maxViewZ) * 0.5;
  const halfDepth = Math.max((maxViewZ - minViewZ) * 0.5 * extentScale, 1e-4);
  camera.near = Math.max(-depthCenter - halfDepth, 1e-4);
  camera.far = Math.max(-depthCenter + halfDepth, camera.near + 1e-4);
  camera.projection = createOrthographicProjection({
    halfHeight: Math.max(halfHeight * extentScale, 1e-4),
    halfWidth: Math.max(halfWidth * extentScale, 1e-4),
  });
}

const _eye: Vector3Like = { x: 0, y: 0, z: 0 };
const _target: Vector3Like = { x: 0, y: 0, z: 0 };
const _upY: Vector3Like = { x: 0, y: 1, z: 0 };
const _upZ: Vector3Like = { x: 0, y: 0, z: 1 };
