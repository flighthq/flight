// A compiled mesh-material pipeline plus the material bind-group layout its group(2) targets. Frame and
// Draw layouts are shared on the runtime (see ensureWgpuSceneLayouts), so they are not stored here.
// `hasShadowGroup` is set when the pipeline was laid out with the group(3) shadow-sample layout (lit
// families that PCF-sample the directional shadow map); beginWgpuMeshDraw then also binds group(3).
export interface WgpuMeshPipeline {
  hasIblGroup: boolean;
  hasPbrSampleGroup: boolean;
  hasShadowGroup: boolean;
  materialBindGroupLayout: GPUBindGroupLayout;
  pipeline: GPURenderPipeline;
}

// The shared group(0)/group(1) bind-group layouts every family pipeline uses. Created once per state.
export interface WgpuSceneLayouts {
  drawBindGroupLayout: GPUBindGroupLayout;
  frameBindGroupLayout: GPUBindGroupLayout;
}
