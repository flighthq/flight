import type { Camera3D, Node3D, Scene3DLightsLike } from '@flighthq/types/contract';

import type { WgpuRenderState } from './WgpuRenderState.ts';

// scene-wgpu's per-WgpuRenderState private state — the WGSL mirror of GlScene3DRuntime. Holds the 3D
// mesh-material pipeline cache (keyed by family + define key + color-attachment format), a reference
// to the device-owned geometry GPU-upload cache, the shared group(0)/group(1)
// Frame + Draw bind-group layouts (every family pipeline targets these), and the shared GPU resources
// the draw path reuses every frame (the Frame uniform buffer + its bind group, the dynamic-offset Draw
// bind group, the 1x1 placeholder map texture, and a per-material bind-group cache). `activeMeshPipeline`
export type WgpuScene3DPass = (
  state: WgpuRenderState,
  scene: Readonly<Node3D>,
  camera: Readonly<Camera3D>,
  lights: Readonly<Scene3DLightsLike>,
) => void;
