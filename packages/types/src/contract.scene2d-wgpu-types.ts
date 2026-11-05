// Acyclic compatibility base used by @flighthq/scene2d-wgpu's contract-only build. Module suffix
// resolution selects exact projection copies for the two Types files that now point back to the owner.
export type { CanvasSurface } from './CanvasSurface.ts';
export type { ColorScaleBias } from './ColorScaleBias.ts';
export type { ImageResource } from './ImageResource.ts';
export type { RendererData } from './RendererData.ts';
export type { RenderProxy2D } from './RenderProxy2D.ts';
export type { RichText } from './RichText.ts';
export type { TextLayoutResult } from './TextLayout.ts';
export type { TintMaterialData } from './TintMaterialData.ts';
export type {
  WgpuColorAdjustmentFlush,
  WgpuRenderState,
  WgpuRenderStateRuntime,
  WgpuShapeMeshBuffers,
} from './WgpuRenderState.ts';
