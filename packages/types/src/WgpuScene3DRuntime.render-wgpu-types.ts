import type { Camera3D } from './Camera3D.ts';
import type { Node3D } from './Node3D.ts';
import type { Scene3DLightsLike } from './Scene3DLights.ts';
import type { WgpuRenderState } from './WgpuRenderState.ts';

// Exact narrow bridge retained for the Render-WGPU contract cycle. The backend state owns the pass
// registry, while Scene3D-WGPU implements pass functions; no Scene3D-WGPU runtime records belong here.
export type WgpuScene3DPass = (
  state: WgpuRenderState,
  scene: Readonly<Node3D>,
  camera: Readonly<Camera3D>,
  lights: Readonly<Scene3DLightsLike>,
) => void;
