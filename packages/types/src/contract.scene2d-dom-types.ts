// Acyclic compatibility base used by @flighthq/scene2d-dom's contract-only build: only the render seams
// still declared here (Rust owner flight-render, no TS owner lane yet). Owned names come from their lanes.
export type { CanvasShapeCommand } from './CanvasShapeRegistry.ts';
export type { EffectPaddingResolver } from './EffectPadding.ts';
export type { NodeRenderer } from './NodeRenderer.ts';
export type { RenderProxy2D } from './RenderProxy2D.ts';
export type {
  RenderRegistries,
  RenderState,
  RenderStateRuntime,
  Scene3DGraphSyncPolicy,
  StrokeTessellator,
} from './RenderState.ts';
export type { ShapeRasterizer } from './ShapeRasterizer.ts';
