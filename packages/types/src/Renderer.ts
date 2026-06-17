import type { BatchFormat } from './BatchFormat';
import type { Renderable } from './Renderable';
import type { RendererData } from './RendererData';
import type { RenderProxy } from './RenderProxy';
import type { RenderState } from './RenderState';

export interface Renderer {
  // Declares which geometry accumulation pipeline this renderer submits into. When set, the
  // render walk can flush automatically on format changes instead of each immediate-draw renderer
  // flushing manually. Absent means the renderer manages its own flush boundaries.
  format?: BatchFormat;
  createData(state: RenderState, source: Renderable): RendererData | null;
  submit(state: RenderState, node: RenderProxy): void;
}
