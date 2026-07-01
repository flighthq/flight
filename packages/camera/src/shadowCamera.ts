import type { AabbLike, Camera, Vector3Like } from '@flighthq/types';

import { setCameraViewMatrix4FromLookAt } from './camera';
import { createOrthographicProjection } from './projection';

// Configures `camera` as the shadow camera for a directional light — the spec's "a shadow camera is
// just a Camera placed at the light." Looks along `lightDirection` (the light's travel direction) at
// the centre of `sceneBounds`, with an orthographic frustum sized to the scene's bounding sphere so the
// whole scene fits the shadow map. The render side then draws scene depth from this camera into the
// shadow map and samples it during shading.
//
// Backend-agnostic CPU math (no GL). `lightDirection` need not be normalized. A degenerate (single
// point) bounds falls back to unit radius so the frustum stays valid.
export function configureDirectionalShadowCamera(
  camera: Camera,
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

  setCameraViewMatrix4FromLookAt(camera, _eye, _target, up);
  camera.near = radius; // distance - radius
  camera.far = radius * 3; // distance + radius
  camera.projection = createOrthographicProjection({ halfHeight: radius, halfWidth: radius });
}

const _eye: Vector3Like = { x: 0, y: 0, z: 0 };
const _target: Vector3Like = { x: 0, y: 0, z: 0 };
const _upY: Vector3Like = { x: 0, y: 1, z: 0 };
const _upZ: Vector3Like = { x: 0, y: 0, z: 1 };
