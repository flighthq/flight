import type { Camera3D } from '@flighthq/camera/contract';
import type { Scene3DLightsLike } from '@flighthq/lighting/contract';
import type { Node3D } from '@flighthq/scene3d/contract';

import type { GlRenderState } from './GlRenderState.ts';

// Exact reverse-dependency bridge consumed by the Render GL contract. The full Scene3D GL runtime
// belongs to @flighthq/scene3d-gl; Render GL needs only the optional pass callback installed into its
// registry, and cannot import the downstream backend package without creating a package cycle.
export type GlScene3DPass = (
  state: GlRenderState,
  scene: Readonly<Node3D>,
  camera: Readonly<Camera3D>,
  lights: Readonly<Scene3DLightsLike>,
) => void;
