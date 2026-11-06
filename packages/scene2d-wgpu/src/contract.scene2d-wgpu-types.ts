// Acyclic build entry selected by contract-only projects through the `.scene2d-wgpu-types` suffix.
// The published contract entry also exposes runtime helpers without making this header lane cyclic.
export type {
  WgpuColorAdjustmentMaterialFeature,
  WgpuColorAdjustmentMaterialFeatureGuard,
} from './types/WgpuColorAdjustmentMaterialFeature.ts';
export type { WgpuRenderStats } from './types/WgpuRenderStats.ts';
export type { WgpuRichTextOverlay } from './types/WgpuRichTextOverlay.ts';
export type { WgpuShapeMesh } from './types/WgpuShapeMesh.ts';
export type { WgpuShapeRendererData } from './types/WgpuShapeRendererData.ts';
