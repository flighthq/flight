// Acyclic compatibility base used by @flighthq/scene2d-dom's contract-only build: only the render seams
// still declared here (Rust owner flight-render, no TS owner lane yet). Owned names come from their lanes.
export type { CanvasShapeCommand } from './CanvasShapeRegistry.ts';
export type { EffectPaddingResolver } from './EffectPadding.ts';
export type {
  NodeRenderer,
  RenderProxy2D,
  RenderRegistries,
  RenderState,
  RenderStateRuntime,
  Scene3DGraphSyncPolicy,
  ShapeRasterizer,
  StrokeTessellator,
} from '@flighthq/render/contract';
