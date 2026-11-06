// Exact bridge for the Render-WGPU owner contract. Only Types-owned modifier/scene headers remain;
// all acyclic dependencies arrive from their package owners.
export type { Modifier, ModifierDefinition } from '@flighthq/shading/contract';
export type { Node3D } from '@flighthq/scene3d/contract';
export type {
  WgpuColorAdjustmentMaterialFeature,
  WgpuColorAdjustmentMaterialFeatureGuard,
} from '@flighthq/render-wgpu/contract';
