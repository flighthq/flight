import type { ColorScaleBias } from '@flighthq/adjustments/contract';
import type { TintMaterialData } from '@flighthq/materials/contract';
import type { RenderProxy2D } from '@flighthq/render/contract';

import type {
  WgpuColorAdjustmentFlush,
  WgpuRenderState,
  WgpuRenderStateRuntime,
  WgpuShapeMeshBuffers,
} from './WgpuRenderState.ts';
import type { WgpuShapeMesh } from './WgpuShapeMesh.ts';

// The opt-in inline color-adjustment fold stored by a WebGPU render state. The implementation may
// live in a higher-level renderer, but this capability contract belongs beside the registry that
// stores it so the render-wgpu owner lane remains acyclic.
export interface WgpuColorAdjustmentMaterialFeature {
  fragmentShaderChunk: string;
  matrixFragmentShaderChunk: string;
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
