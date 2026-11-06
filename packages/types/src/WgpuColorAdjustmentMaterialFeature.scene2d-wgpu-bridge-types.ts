import type { ColorScaleBias } from './ColorScaleBias.ts';
import type { RenderProxy2D } from './RenderProxy2D.ts';
import type { TintMaterialData } from './TintMaterialData.ts';
import type {
  WgpuColorAdjustmentFlush,
  WgpuRenderState,
  WgpuRenderStateRuntime,
  WgpuShapeMeshBuffers,
} from './WgpuRenderState.ts';
import type { WgpuShapeMesh } from './WgpuShapeMesh.ts';

// Exact focused bridge for the Render-WGPU registry cycle. Render-WGPU stores this Scene2D-WGPU
// feature, while the feature names Render-WGPU state and shape-buffer contracts.
export interface WgpuColorAdjustmentMaterialFeature {
  readonly fragmentShaderChunk: string;
  readonly matrixFragmentShaderChunk: string;
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
