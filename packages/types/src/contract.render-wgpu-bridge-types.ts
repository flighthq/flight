// Exact bridge for the Render-WGPU owner contract. Only Types-owned modifier/scene headers and the
// Scene2D-WGPU registry cycle remain; all acyclic dependencies arrive from their package owners.
export type { Modifier, ModifierDefinition } from '@flighthq/shading/contract';
export type { Node3D } from '@flighthq/scene3d/contract';
export type {
  WgpuColorAdjustmentMaterialFeature,
  WgpuColorAdjustmentMaterialFeatureGuard,
} from './WgpuColorAdjustmentMaterialFeature.scene2d-wgpu-bridge-types.ts';
