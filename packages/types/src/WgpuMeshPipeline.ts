import type { Entity } from './Entity';

// A compiled mesh-material pipeline plus the material bind-group layout its group(2) targets. Frame and
// Draw layouts are shared on the runtime (see ensureWgpuScene3DLayouts), so they are not stored here.
// `hasShadowGroup` is set when the pipeline was laid out with the group(3) shadow-sample layout (lit
// families that PCF-sample the directional shadow map); beginWgpuMeshDraw then also binds group(3).
export interface WgpuMeshPipeline extends Entity {
  hasIblGroup: boolean;
  hasPbrSampleGroup: boolean;
  hasShadowGroup: boolean;
  materialBindGroupLayout: GPUBindGroupLayout;
  pipeline: GPURenderPipeline;
  // True only for the HAS_SKIN variant whose group(1) also carries the RGBA32F joint palette.
  skinned: boolean;
}

// The shared group(0)/group(1) bind-group layouts every family pipeline uses. Created once per state.
export interface WgpuScene3DLayouts {
  drawBindGroupLayout: GPUBindGroupLayout;
  frameBindGroupLayout: GPUBindGroupLayout;
}
