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
  // Frees any non-GC resource this renderer allocated into `data` (GPU textures, framebuffers).
  // Called when the proxy's renderer/data is replaced or the proxy is destroyed. Optional: renderers
  // whose data holds only GC-managed values (or none) omit it. `destroy*` semantics — frees now.
  destroyData?(state: RenderState, data: RendererData): void;
  submit(state: RenderState, node: RenderProxy): void;
}
