import type { Material, MaterialData } from './Material';
import type { WebGPURenderState } from './WebGPURenderState';

// Per-backend behavior for a material kind on WebGPU, registered against the kind on the render
// state via registerWebGPUMaterialRenderer. The renderer owns its shader module; the sprite batch
// holds no shader of its own, so every batch — including the bundled default — renders only through
// a registered material. A material reads the fixed base instance record (world transform, region
// size, UV rect, alpha) from the shared instance storage buffer and may append its own per-instance
// floats in a parallel material storage buffer.
//
// A material may use only its shader (instanceFloatCount = 0, no packInstance), or it may extend the
// per-instance layout and populate it from its own sources or each node's materialData. The base
// instance layout is a fixed contract a material shader reads but never changes; geometry and
// topology remain graph-kind territory.
export interface WebGPUMaterialRenderer {
  // Number of per-instance floats this material appends to the parallel material storage buffer
  // (@group(3) @binding(0), declared as array<f32> in the material's shader). Zero for materials
  // that need no per-instance data.
  readonly instanceFloatCount: number;

  // The shader module providing vs_main and fs_main for this material's sprite-batch pipeline. It
  // reads the shared base instance record at @group(2) @binding(0); a material with
  // instanceFloatCount > 0 also reads its per-instance floats at @group(3) @binding(0). Reuse
  // getWebGPUQuadBatchPreludeWGSL for the base bindings and vertex helper, and cache the compiled
  // module per device.
  getShaderModule(state: WebGPURenderState): GPUShaderModule;

  // Convert one instance's `materialData` (and the batch material) into instanceFloatCount floats
  // written at out[offset..]. Called once per accumulated instance during batch packing. Omitted by
  // materials with instanceFloatCount = 0.
  packInstance?(
    state: WebGPURenderState,
    material: Readonly<Material> | null,
    materialData: MaterialData | null,
    out: Float32Array,
    offset: number,
  ): void;
}
