import type { WgpuEffectBlendMode } from './WgpuEffectBlendMode';

export type WgpuEffectPipeline = {
  // The default variant, compiled for the canvas format (state.format).
  pipeline: GPURenderPipeline;
  blendMode: WgpuEffectBlendMode;
  // Compiles a variant of this pipeline targeting `format`. A render pipeline's color target format must
  // match the attachment it draws into, so drawing into a non-canvas-format target (an HDR
  // rgba16float effect target) needs a matching variant; the draw path resolves and caches it per format.
  // Optional so externally-constructed WgpuEffectPipeline values (e.g. the gradient recipes) still type.
  compileForFormat?: (format: GPUTextureFormat) => GPURenderPipeline;
  variants?: Map<GPUTextureFormat, GPURenderPipeline>;
};
