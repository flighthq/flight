// Acyclic build entry selected by contract-only projects through the `.scene3d-wgpu-types` suffix.
// The published contract entry also exposes runtime helpers without making this header lane cyclic.
export type {
  WgpuClassicDefineKey,
  WgpuClassicLightingModel,
  WgpuClassicPipeline,
} from './types/WgpuClassicPipeline.ts';
export type { WgpuDebugDefineKey, WgpuDebugPipeline } from './types/WgpuDebugPipeline.ts';
export type { WgpuMatcapDefineKey, WgpuMatcapPipeline } from './types/WgpuMatcapPipeline.ts';
export type { WgpuMeshPipeline, WgpuScene3DLayouts } from './types/WgpuMeshPipeline.ts';
export type { WgpuPbrDefineKey, WgpuPbrPipeline } from './types/WgpuPbrPipeline.ts';
export type { WgpuScene3DForwardLightList } from './types/WgpuScene3DForwardLightList.ts';
export type {
  WgpuMaterialBinding,
  WgpuMeshUpload,
  WgpuScene3DDrawEntry,
  WgpuScene3DFrameBinding,
  WgpuScene3DIbl,
  WgpuScene3DRuntime,
  WgpuScene3DShadow,
} from './types/WgpuScene3DRuntime.ts';
export type { WgpuToonDefineKey, WgpuToonPipeline } from './types/WgpuToonPipeline.ts';
export type { WgpuUnlitDefineKey, WgpuUnlitPipeline } from './types/WgpuUnlitPipeline.ts';
export type { WgpuWireframePipeline, WgpuWireframeUpload } from './types/WgpuWireframePipeline.ts';
