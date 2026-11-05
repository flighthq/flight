import type {
  ColorScaleBias,
  RenderProxy2D,
  TintMaterialData,
  WgpuColorAdjustmentFlush,
  WgpuRenderState,
  WgpuRenderStateRuntime,
  WgpuShapeMeshBuffers,
} from '@flighthq/types/contract';

import type { WgpuShapeMesh } from './WgpuShapeMesh.ts';

// The opt-in inline color-adjustment fold for the WebGPU sprite/quad batch. Registered as persistent
// per-state policy by registerWgpuColorAdjustmentMaterialFeature; absent on a state that never opted in,
// so the base batch — which only ever reaches this through the optional registry slot — carries none of the fold's WGSL and
// tree-shakes it out. `record` folds one instance's color adjustment into the active batch's
// promote-not-split state machine; `resolveFlush` returns the group-3 storage data + folded shader
// module for a tinted batch (or null when the batch has no adjustment, so the caller runs the lean
// material path). This is the generic capability seam — color adjustment is its first consumer.
export interface WgpuColorAdjustmentMaterialFeature {
  // The one backend-authored pointwise color-remap implementation, spliced only into promoted
  // material-family variants. It lives on the registered feature to preserve bundle shake-out.
  readonly fragmentShaderChunk: string;
  readonly matrixFragmentShaderChunk: string;
  // Optional because the feature contract is also used by 3D material-family compilers, which need
  // only the shader chunks. The scene2d implementation installs this hook so tessellated solid fills
  // reach the same opt-in fold without the lean mesh path importing its shader implementation.
  drawShapeMeshes?(
    state: WgpuRenderState,
    renderProxy: RenderProxy2D,
    meshes: readonly WgpuShapeMesh[],
    buffers: WgpuShapeMeshBuffers,
  ): void;
  record(
    runtime: WgpuRenderStateRuntime,
    colorScaleBias: ColorScaleBias | TintMaterialData | Readonly<Float32Array> | null | undefined,
    instanceIndex: number,
  ): void;
  resolveFlush(state: WgpuRenderState, count: number): WgpuColorAdjustmentFlush | null;
}

export type WgpuColorAdjustmentMaterialFeatureGuard = (
  state: WgpuRenderState,
  colorScaleBias: Readonly<ColorScaleBias | TintMaterialData | Float32Array>,
) => void;
